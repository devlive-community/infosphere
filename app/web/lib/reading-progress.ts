// 阅读进度：优先服务端存储（跨设备），未登录时回退 localStorage
import { api } from './api'

interface ProgressEntry {
  docId?: number
  docSlug: string
  docTitle: string
  chapterPrefix?: string
}

const LOCAL_KEY = 'infosphere_reading_progress'

function localRead(): Record<string, ProgressEntry> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')
  } catch {
    return {}
  }
}

// save 记录阅读进度：登录用户写服务端（fire-and-forget），未登录写本地
export function saveReadingProgress(username: string, bookId: number, entry: ProgressEntry): void {
  if (typeof window === 'undefined') return
  if (!username) {
    const map = localRead()
    map[String(bookId)] = entry
    localStorage.setItem(LOCAL_KEY, JSON.stringify(map))
    return
  }
  api(`/reading-progress/${bookId}`, { method: 'PUT', body: { doc_id: entry.docId, doc_slug: entry.docSlug, doc_title: entry.docTitle } }).catch(() => {})
}

// get 读取进度：登录走服务端（null 视为无），未登录读本地
export async function getReadingProgress(username: string, bookId: number): Promise<ProgressEntry | null> {
  if (!username) {
    return localRead()[String(bookId)] || null
  }
  try {
    const data = await api<ProgressEntry | null>(`/reading-progress/${bookId}`)
    if (data && (data as any).doc_slug) return { docSlug: (data as any).doc_slug, docTitle: (data as any).doc_title }
    return null
  } catch {
    return null
  }
}
