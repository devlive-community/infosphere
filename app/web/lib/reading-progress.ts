// 阅读进度：localStorage 记录每个用户最近读到的章节（后续 M10/M13 可升级为服务端存储）
const KEY = 'infosphere_reading_progress'

interface ProgressEntry {
  docSlug: string
  docTitle: string
  chapterPrefix: string
  at: number
}

type ProgressMap = Record<string, Record<string, ProgressEntry>> // user -> book -> entry

function read(): ProgressMap {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

// save 记录用户在某本书读到的章节；username 为空时用 anonymous
export function saveReadingProgress(username: string, bookSlug: string, entry: { docSlug: string; docTitle: string; chapterPrefix: string }): void {
  if (typeof window === 'undefined') return
  const map = read()
  const user = username || 'anonymous'
  map[user] = map[user] || {}
  map[user][bookSlug] = { ...entry, at: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(map))
}

// get 读取用户在某本书的进度
export function getReadingProgress(username: string, bookSlug: string): ProgressEntry | null {
  const map = read()
  return map[username || 'anonymous']?.[bookSlug] || null
}
