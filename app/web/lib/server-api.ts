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

// 站点配置缓存：避免每个 SSR 请求都查一次站点配置
let siteCache: { value: Record<string, string>; expires: number } | null = null

export async function getSiteConfig(): Promise<Record<string, string>> {
  if (siteCache && siteCache.expires > Date.now()) return siteCache.value
  try {
    const value = await serverApi<Record<string, string>>('/site')
    siteCache = { value, expires: Date.now() + 60_000 }
    return value
  } catch {
    return siteCache?.value ?? {}
  }
}

export function invalidateSiteCache(): void {
  siteCache = null
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
