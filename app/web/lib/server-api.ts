// 服务端数据获取：getServerSideProps 专用。
// 通过内网地址直连 Go API（INFO_SPHERE_API_URL，默认 http://127.0.0.1:6969），
// 不经过 nginx，也不受 CORS 限制。
import type { User } from './types'

const API_INTERNAL = process.env.INFO_SPHERE_API_URL || 'http://127.0.0.1:6969'

export class ServerApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface ServerApiOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean | undefined | null>
}

export async function serverApi<T = any>(path: string, options: ServerApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, params } = options
  const query = params
    ? '?' + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      )
    : ''
  const reqHeaders: Record<string, string> = { ...headers }
  if (body !== undefined) reqHeaders['Content-Type'] = 'application/json'

  const res = await fetch(`${API_INTERNAL}/api/v1${path}${query}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // API 数据变化需要即时反映到 SEO 页面
    cache: 'no-store',
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || payload.success === false) {
    throw new ServerApiError(payload.message || `请求失败 (${res.status})`, res.status)
  }
  return payload.data as T
}

// 请求头中透传用户令牌与 Cookie（用于登录用户浏览自己的草稿、SSR 渲染登录态）
export function authHeaderFrom(req: { headers: Record<string, string | string[] | undefined> }): Record<string, string> {
  const h: Record<string, string> = {}
  const raw = req.headers['authorization']
  if (raw) h.Authorization = Array.isArray(raw) ? raw[0] : raw
  const cookie = req.headers['cookie']
  if (cookie) h.Cookie = Array.isArray(cookie) ? cookie[0] : cookie
  const acceptLanguage = req.headers['accept-language']
  if (acceptLanguage) h['Accept-Language'] = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage
  return h
}

// SSR 获取当前登录用户（未登录返回 null，不抛错）
export async function getSSRUser(req: { headers: Record<string, string | string[] | undefined> }): Promise<User | null> {
  try {
    return await serverApi<User>('/auth/me', { headers: authHeaderFrom(req) })
  } catch {
    return null
  }
}

// 安装状态检测：短暂缓存，避免每个 SSR 请求都打一次 API
let installState: { installed: boolean; expires: number } | null = null

export async function isInstalled(): Promise<boolean> {
  if (installState && installState.expires > Date.now()) return installState.installed
  try {
    const status = await serverApi<{ installed: boolean }>('/setup/status')
    installState = { installed: status.installed, expires: Date.now() + 3_000 }
    return status.installed
  } catch {
    // API 不可用时保持上一次的状态（未启动过则视为未安装）
    return installState?.installed ?? false
  }
}

// 站点配置每次 SSR 都实时拉取：/site 是轻查询，且含插件启用状态（feature_plugins），
// 不能缓存——否则管理员启用/禁用插件后要等缓存过期、页面「刷新几十次才生效」。
// 仅保留「上次成功值」作为后端不可用时的兜底，不作为 TTL 缓存。
let lastGoodSite: Record<string, string> | null = null

export async function getSiteConfig(): Promise<Record<string, string>> {
  try {
    const value = await serverApi<Record<string, string>>('/site')
    lastGoodSite = value
    return value
  } catch {
    return lastGoodSite ?? {}
  }
}

export function invalidateSiteCache(): void {
  lastGoodSite = null
}

// 从请求推导对外站点根地址（canonical / sitemap / JSON-LD 用）
export function siteUrlFrom(req: { headers: Record<string, string | string[] | undefined> }): string {
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || 'localhost:3000'
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http'
  return `${proto}://${host}`
}

// 纯文本摘要：从 Markdown 生成 meta description
export function excerptFrom(markdown: string | null | undefined, max = 160): string {
  if (!markdown) return ''
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gim, '')
    .replace(/[>*~_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
