// 管理控制台共享类型与工具
import { API_BASE } from './api'

export interface SystemVersion {
  version: string
  commit: string
  build_date: string
  update_available: boolean
  latest: { version: string; url: string; published_at: string } | null
}

export interface HealthInfo {
  status: string
  db: string
  installed: boolean
  version: string
  commit: string
  build_date: string
  web: string
  node: string
}

export interface OAuthConfig {
  provider: string
  client_id: string
  client_secret: string
}

export interface MailConfig {
  driver: string
  host: string
  port: number
  username: string
  password: string
  from: string
  site_url: string
  notifications_enabled?: boolean
}

export interface StorageConfig {
  driver: string
  qiniu_access_key: string
  qiniu_secret_key: string
  qiniu_bucket: string
  qiniu_domain: string
  qiniu_upload_host: string
}

export interface ConfigItem {
  key: string
  value: string
  description: string
  reserved: boolean
  updated_at: string
}

export interface ActivityUser {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export interface ActivityBook {
  id: number
  title: string
  slug: string
  user_id: number
  status: string
  is_public: boolean
  created_at: string
  user?: { id: number; username: string } | null
}

export interface AdminActivity {
  recent_users: ActivityUser[]
  recent_books: ActivityBook[]
}

export const emptyMail: MailConfig = { driver: 'log', host: '', port: 587, username: '', password: '', from: '', site_url: '' }
export const emptyStorage: StorageConfig = { driver: 'local', qiniu_access_key: '', qiniu_secret_key: '', qiniu_bucket: '', qiniu_domain: '', qiniu_upload_host: '' }

// fetchHealth 读取 /health（未包装 data 的原始响应），并测量往返延迟
export async function fetchHealth(): Promise<{ health: HealthInfo; latency: number }> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const res = await fetch(`${API_BASE}/api/v1/health`)
  const latency = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  const health = (await res.json()) as HealthInfo
  return { health, latency }
}

// measure 测量任意请求的往返延迟（毫秒）；失败返回 -1
export async function measure(path: string, init?: RequestInit): Promise<number> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  try {
    await fetch(`${API_BASE}${path}`, init)
  } catch {
    return -1
  }
  return Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
}
