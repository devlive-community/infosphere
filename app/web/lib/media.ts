// 媒体地址解析：封面/头像等统一入口。
// API 返回的相对路径（如 /uploads/x.png）需要拼接 API_BASE（跨端部署时指向 Go 服务）；
// 绝对 http(s) 地址原样返回。
import { API_BASE } from './api'

export function resolveMediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}
