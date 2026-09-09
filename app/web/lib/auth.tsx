import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/router'
import { api, getToken, storeSession, clearSession } from './api'
import type { SiteConfig, User } from './types'

export interface ThemeSetting {
  primary_hue: string
  radius: string
  button_size: string
  font_size: string
  content_width: string
  nav_height: string
  sidebar_width: string
  page_bg: string
}

/** 将主题设置写入 DOM 与 localStorage，供 _document.tsx 防闪烁脚本与全局使用 */
export function applyTheme(s: ThemeSetting) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.setAttribute('data-primary', s.primary_hue)
  el.setAttribute('data-radius', s.radius)
  el.setAttribute('data-btn', s.button_size)
  el.setAttribute('data-font', s.font_size)
  el.setAttribute('data-width', s.content_width)
  el.setAttribute('data-nav', s.nav_height)
  el.setAttribute('data-sidebar', s.sidebar_width)
  el.style.setProperty('--page-bg', s.page_bg)
  localStorage.setItem('infosphere_theme', JSON.stringify(s))
}

interface AppContextValue {
  user: User | null
  authReady: boolean
  installed: boolean | null // null = 未知
  site: SiteConfig
  theme: ThemeSetting
  login: (token: string, user: User) => void
  logout: () => void
  refreshUser: () => Promise<User>
  applyTheme: (s: ThemeSetting) => void
}

const DEFAULT_THEME: ThemeSetting = {
  primary_hue: 'blue',
  radius: 'lg',
  button_size: 'md',
  font_size: '15',
  content_width: 'normal',
  nav_height: '64',
  sidebar_width: '260',
  page_bg: '#F7F6F2',
}

const AppContext = createContext<AppContextValue>({
  user: null,
  authReady: false,
  installed: null,
  site: {},
  theme: DEFAULT_THEME,
  login: () => {},
  logout: () => {},
  refreshUser: async () => { throw new Error('not ready') },
  applyTheme: () => {},
})

interface AppProviderProps {
  children: ReactNode
  /** SSR 页面通过 pageProps 传入的站点配置，避免客户端首屏闪烁 */
  initialSite?: SiteConfig | null
  /** SSR 页面传入的安装状态（服务端已校验，未安装不会渲染到客户端） */
  initialInstalled?: boolean | null
  /** SSR 经 Cookie 校验出的登录用户，消除刷新时先未登录后登录的闪烁 */
  initialUser?: User | null
}

// ensureAuthCookie 老用户升级后补种令牌 Cookie，让下一次刷新 SSR 即可渲染登录态
function ensureAuthCookie() {
  const token = getToken()
  if (token && typeof document !== 'undefined' && !document.cookie.includes('infosphere_token=')) {
    document.cookie = `infosphere_token=${token}; path=/; max-age=604800`
  }
}

export function AppProvider({ children, initialSite, initialInstalled, initialUser }: AppProviderProps) {
  const router = useRouter()
  // 客户端首帧必须与 SSR 使用相同登录态，避免 hydration 时导航与管理操作结构不一致。
  // SSR 未拿到用户但本地仍有令牌的旧会话，由下方 effect 在 hydration 后校验并恢复。
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [authReady, setAuthReady] = useState(false)
  // 仅信任 SSR 显式传入的安装状态；客户端页面走 boot 检测
  const [installed, setInstalled] = useState<boolean | null>(initialInstalled ?? null)
  const [site, setSite] = useState<SiteConfig>(initialSite ?? {})
  const [theme, setTheme] = useState<ThemeSetting>(DEFAULT_THEME)

  // 登录后从服务端拉取主题设置并应用
  const loadAndApplyTheme = useCallback(async () => {
    try {
      const s = await api<ThemeSetting>('/auth/theme-settings')
      setTheme(s)
      applyTheme(s)
    } catch { /* 未登录或接口异常时保持默认 */ }
  }, [])

  useEffect(() => {
    if (initialInstalled) {
      // SSR 已渲染登录态；仅当 SSR 未知用户且本地有令牌时才校验（例如令牌过期）
      if (!initialUser && getToken()) {
        api<User>('/auth/me')
          .then((me) => { setUser(me); ensureAuthCookie(); loadAndApplyTheme() })
          .catch(() => clearSession())
          .finally(() => setAuthReady(true))
      } else {
        setAuthReady(true)
        if (initialUser) loadAndApplyTheme()
      }
      return
    }
    let cancelled = false
    async function boot() {
      try {
        const status = await api<{ installed: boolean }>('/setup/status')
        if (cancelled) return
        setInstalled(status.installed)
        if (!status.installed) {
          setAuthReady(true)
          return
        }
        try {
          setSite(await api<SiteConfig>('/site'))
        } catch { /* 忽略站点配置错误 */ }
        if (getToken()) {
          try {
            const me = await api<User>('/auth/me')
            if (!cancelled) { setUser(me); ensureAuthCookie(); loadAndApplyTheme() }
          } catch {
            clearSession()
          }
        }
      } catch {
        if (!cancelled) setInstalled(null)
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    }
    boot()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 安装守卫：未安装时强制进入 /install
  useEffect(() => {
    if (installed === null) return
    if (!installed && router.pathname !== '/install') {
      router.replace('/install')
    }
    if (installed && router.pathname === '/install') {
      router.replace('/')
    }
  }, [installed, router])

  const login = useCallback((token: string, u: User) => {
    storeSession(token, u)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    document.cookie = 'infosphere_token=; Max-Age=0; path=/'
    localStorage.removeItem('infosphere_theme')
    applyTheme(DEFAULT_THEME)
    setUser(null)
    router.push('/login')
  }, [router, applyTheme])

  const refreshUser = useCallback(async () => {
    const me = await api<User>('/auth/me')
    setUser(me)
    return me
  }, [])

  const handleApplyTheme = useCallback((s: ThemeSetting) => {
    setTheme(s)
    applyTheme(s)
  }, [])

  return (
    <AppContext.Provider value={{ user, authReady, installed, site, theme, login, logout, refreshUser, applyTheme: handleApplyTheme }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  return useContext(AppContext)
}

// 页面级登录守卫，返回当前用户或 null（未就绪/已跳转登录页）
export function useRequireAuth(): User | null {
  const { user, authReady } = useApp()
  const router = useRouter()
  useEffect(() => {
    if (authReady && !user) router.replace('/login')
  }, [authReady, user, router])
  return authReady && user ? user : null
}
