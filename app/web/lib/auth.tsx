import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/router'
import { api, getToken, storeSession, clearSession } from './api'
import type { SiteConfig, User } from './types'

interface AppContextValue {
  user: User | null
  authReady: boolean
  installed: boolean | null // null = 未知
  site: SiteConfig
  login: (token: string, user: User) => void
  logout: () => void
  refreshUser: () => Promise<User>
}

const AppContext = createContext<AppContextValue>({
  user: null,
  authReady: false,
  installed: null,
  site: {},
  login: () => {},
  logout: () => {},
  refreshUser: async () => { throw new Error('not ready') },
})

interface AppProviderProps {
  children: ReactNode
  /** SSR 页面通过 pageProps 传入的站点配置，避免客户端首屏闪烁 */
  initialSite?: SiteConfig | null
  /** SSR 页面传入的安装状态（服务端已校验，未安装不会渲染到客户端） */
  initialInstalled?: boolean | null
}

export function AppProvider({ children, initialSite, initialInstalled }: AppProviderProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  // 仅信任 SSR 显式传入的安装状态；客户端页面走 boot 检测
  const [installed, setInstalled] = useState<boolean | null>(initialInstalled ?? null)
  const [site, setSite] = useState<SiteConfig>(initialSite ?? {})

  useEffect(() => {
    if (initialInstalled) {
      // 服务端已确认安装完成，仅补充登录态
      if (getToken()) {
        api<User>('/auth/me').then(setUser).catch(() => clearSession()).finally(() => setAuthReady(true))
      } else {
        setAuthReady(true)
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
            if (!cancelled) setUser(me)
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
    setUser(null)
    router.push('/login')
  }, [router])

  const refreshUser = useCallback(async () => {
    const me = await api<User>('/auth/me')
    setUser(me)
    return me
  }, [])

  return (
    <AppContext.Provider value={{ user, authReady, installed, site, login, logout, refreshUser }}>
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
