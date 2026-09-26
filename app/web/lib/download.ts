import { API_BASE, getToken } from '@/lib/api'

// downloadAuthed 以当前登录态下载接口返回的文件（直接链接无法携带请求头）；失败时抛出服务端给出的错误说明。
export async function downloadAuthed(path: string, params: Record<string, string | number | undefined>, filename: string): Promise<void> {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query.set(k, String(v)) })
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/v1${path}${query.toString() ? `?${query}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) {
    const msg = await res.json().then((p) => p.message as string).catch(() => '')
    throw new Error(msg || res.statusText)
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// dateStamp 本地日期 YYYY-MM-DD，用于下载文件名。
export function dateStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
