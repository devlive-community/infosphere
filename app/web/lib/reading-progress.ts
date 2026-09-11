// 阅读进度：优先服务端存储（跨设备），未登录时回退 localStorage
import { api } from './api'

interface ProgressEntry {
  docId?: number
  docSlug: string
  docTitle: string
  chapterPrefix?: string
  /** 章节滚动百分比（0-100），用于精确续读定位 */
  scrollPercent?: number
  /** 本次活跃阅读秒数增量（服务端累加到该书 read_seconds） */
  secondsDelta?: number
  /** 服务端返回的累计阅读秒数（读取时可用） */
  readSeconds?: number
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
    // 游客仅本地记录最近章节与滚动位置，不累计阅读时长
    const map = localRead()
    const prev = map[String(bookId)]
    map[String(bookId)] = {
      docId: entry.docId,
      docSlug: entry.docSlug,
      docTitle: entry.docTitle,
      chapterPrefix: entry.chapterPrefix,
      scrollPercent: entry.scrollPercent ?? prev?.scrollPercent,
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(map))
    return
  }
  const body: Record<string, unknown> = { doc_id: entry.docId, doc_slug: entry.docSlug, doc_title: entry.docTitle }
  if (entry.scrollPercent != null) body.scroll_percent = Math.round(entry.scrollPercent)
  if (entry.secondsDelta != null && entry.secondsDelta > 0) body.read_seconds_delta = Math.round(entry.secondsDelta)
  api(`/reading-progress/${bookId}`, { method: 'PUT', body }).catch(() => {})
}

// get 读取进度：登录走服务端（null 视为无），未登录读本地
export async function getReadingProgress(username: string, bookId: number): Promise<ProgressEntry | null> {
  if (!username) {
    return localRead()[String(bookId)] || null
  }
  try {
    const data = await api<Record<string, any> | null>(`/reading-progress/${bookId}`)
    if (data && data.doc_slug) {
      return {
        docId: data.doc_id,
        docSlug: data.doc_slug,
        docTitle: data.doc_title,
        scrollPercent: data.scroll_percent ?? 0,
        readSeconds: data.read_seconds ?? 0,
      }
    }
    return null
  } catch {
    return null
  }
}
