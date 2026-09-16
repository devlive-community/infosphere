import { serverApi } from '@/lib/server-api'
import type { Book, Document, PageResult } from '@/lib/types'

// sitemap 分片构建：index 由 /sitemap.xml 输出，分片由 /sitemaps/{n}.xml 输出。
// 每个分片对应书籍列表 API 的一页（100 本），只拉取自己那页，避免全量遍历。
export const BOOKS_PER_SHARD = 100
// 单分片 URL 上限（sitemaps.org 单文件上限 5 万，留足余量）
const MAX_URLS_PER_SHARD = 20000
// 分片与索引在服务端内存中的缓存时长
const CACHE_TTL_MS = 10 * 60 * 1000
// 每本书章节树的并发拉取数
const DOC_CONCURRENCY = 8

interface CacheEntry {
  xml: string
  expires: number
}

const shardCache = new Map<number, CacheEntry>()
let indexCache: CacheEntry | null = null

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// 将文档树展平为 URL 条目
function flattenDocEntries(bookSlug: string, docs: Document[], out: { loc: string; lastmod: string }[], limit: number) {
  for (const doc of docs) {
    if (out.length >= limit) return
    if (doc.slug) {
      out.push({
        loc: `/book/reader/${encodeURIComponent(bookSlug)}/${encodeURIComponent(doc.slug)}`,
        lastmod: (doc.updated_at || doc.created_at || '').slice(0, 10),
      })
    }
    if (doc.children?.length) flattenDocEntries(bookSlug, doc.children, out, limit)
  }
}

function renderUrlset(entries: { loc: string; lastmod?: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map((e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    ${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}
  </url>`)
  .join('\n')}
</urlset>`
}

// 简单并发池：依次启动最多 DOC_CONCURRENCY 个任务
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

// 构建单个分片 XML：第 n 片 = 书籍列表第 n+1 页 + 各书公开章节
// 匿名请求 /books 与 /books/:id/documents，服务端只返回公开书籍与已发布章节，与游客可见范围一致。
export async function buildSitemapShard(shard: number, siteUrl: string): Promise<string> {
  const cached = shardCache.get(shard)
  if (cached && cached.expires > Date.now()) return cached.xml

  const entries: { loc: string; lastmod?: string }[] = []
  // 第 0 片附带静态页
  if (shard === 0) {
    entries.push(
      ...['', '/explore', '/login', '/register'].map((p) => ({
        loc: `${siteUrl}${p}`,
        lastmod: '',
      })),
    )
  }

  try {
    const data = await serverApi<PageResult<Book>>('/books', {
      params: { page: shard + 1, page_size: BOOKS_PER_SHARD },
    })
    const books = data.items || []
    const bookEntries = books.map((book) => ({
      loc: `${siteUrl}/book/detail/${encodeURIComponent(book.slug)}`,
      lastmod: (book.updated_at || book.created_at || '').slice(0, 10),
    }))

    // 并发拉取各书章节树，失败的书只输出详情页 URL
    const docsPerBook = await mapWithConcurrency(books, DOC_CONCURRENCY, async (book) => {
      try {
        return await serverApi<Document[]>(`/books/${book.id}/documents`)
      } catch {
        return [] as Document[]
      }
    })

    let i = 0
    for (const book of books) {
      if (entries.length >= MAX_URLS_PER_SHARD) break
      entries.push(bookEntries[i])
      const docEntries: { loc: string; lastmod: string }[] = []
      flattenDocEntries(book.slug, docsPerBook[i], docEntries, MAX_URLS_PER_SHARD - entries.length)
      entries.push(...docEntries)
      i++
    }
  } catch {
    // API 不可用：第 0 片至少输出静态页，其余分片输出空 urlset
  }

  const xml = renderUrlset(entries)
  shardCache.set(shard, { xml, expires: Date.now() + CACHE_TTL_MS })
  return xml
}

// 构建 sitemap index XML：按公开书籍总数计算分片数
export async function buildSitemapIndex(siteUrl: string): Promise<string> {
  if (indexCache && indexCache.expires > Date.now()) return indexCache.xml

  let shardCount = 1
  try {
    const data = await serverApi<PageResult<Book>>('/books', { params: { page: 1, page_size: 1 } })
    shardCount = Math.max(1, Math.ceil(data.total / BOOKS_PER_SHARD))
  } catch {
    // API 不可用时退化为仅第 0 片
  }

  const today = new Date().toISOString().slice(0, 10)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from({ length: shardCount }, (_, n) => `  <sitemap>
    <loc>${escapeXml(`${siteUrl}/sitemaps/${n}.xml`)}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`

  indexCache = { xml, expires: Date.now() + CACHE_TTL_MS }
  return xml
}
