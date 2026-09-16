import fs from 'fs'
import path from 'path'
import { serverApi } from '@/lib/server-api'
import type { Book, Document, PageResult } from '@/lib/types'

// sitemap 静态化：
// - XML 生成后写入本地磁盘，访问请求优先读文件（零 API 调用）
// - 每日由后台定时任务全量重建（含 index 与全部分片）
// - 文件缺失或过期时按需同步构建兜底，保证 sitemap 永远可访问
export const BOOKS_PER_SHARD = 100
// 单分片 URL 上限（sitemaps.org 单文件上限 5 万，留足余量）
const MAX_URLS_PER_SHARD = 20000
// 磁盘缓存有效期：超过则按需重建（后台任务每日刷新，正常情况下不会触发）
const DISK_TTL_MS = 24 * 60 * 60 * 1000
// 后台全量重建周期
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
// 每本书章节树的并发拉取数
const DOC_CONCURRENCY = 8

const SITEMAP_DIR = process.env.SITEMAP_DIR || path.join(process.cwd(), '.sitemap-cache')
const INDEX_FILE = 'sitemap.xml'
const SITE_URL_FILE = 'site-url.txt'

interface CacheEntry {
  xml: string
  expires: number
}

const memCache = new Map<number, CacheEntry>()
let indexMemCache: CacheEntry | null = null
// 记录最近一次请求推导出的站点地址，供后台定时任务在没有请求上下文时复用
let lastSiteUrl = ''

let refreshTimer: NodeJS.Timeout | null = null

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

function readDiskCache(name: string): string | null {
  try {
    const p = path.join(SITEMAP_DIR, name)
    const stat = fs.statSync(p)
    if (Date.now() - stat.mtimeMs > DISK_TTL_MS) return null
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

function writeDiskCache(name: string, xml: string): void {
  try {
    fs.mkdirSync(SITEMAP_DIR, { recursive: true })
    fs.writeFileSync(path.join(SITEMAP_DIR, name), xml, 'utf-8')
  } catch {
    // 磁盘不可写时仅用内存缓存
  }
}

// 构建单个分片 XML：第 n 片 = 书籍列表第 n+1 页 + 各书公开章节
// 匿名请求 /books 与 /books/:id/documents，服务端只返回公开书籍与已发布章节，与游客可见范围一致。
async function buildSitemapShardXml(shard: number, siteUrl: string): Promise<string> {
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

  return renderUrlset(entries)
}

// 请求入口：优先磁盘 → 内存 → 按需构建（并回写两层缓存）
export async function getSitemapShard(shard: number, siteUrl: string): Promise<string> {
  const name = `${shard}.xml`
  const disk = readDiskCache(name)
  if (disk) return disk

  const mem = memCache.get(shard)
  if (mem && mem.expires > Date.now()) return mem.xml

  const xml = await buildSitemapShardXml(shard, siteUrl)
  memCache.set(shard, { xml, expires: Date.now() + DISK_TTL_MS })
  writeDiskCache(name, xml)
  return xml
}

// 请求入口：sitemap index
export async function getSitemapIndex(siteUrl: string): Promise<string> {
  const disk = readDiskCache(INDEX_FILE)
  if (disk) return disk

  if (indexMemCache && indexMemCache.expires > Date.now()) return indexMemCache.xml

  const xml = await buildSitemapIndexXml(siteUrl)
  indexMemCache = { xml, expires: Date.now() + DISK_TTL_MS }
  writeDiskCache(INDEX_FILE, xml)
  return xml
}

async function buildSitemapIndexXml(siteUrl: string): Promise<string> {
  let shardCount = 1
  try {
    const data = await serverApi<PageResult<Book>>('/books', { params: { page: 1, page_size: 1 } })
    shardCount = Math.max(1, Math.ceil(data.total / BOOKS_PER_SHARD))
  } catch {
    // API 不可用时退化为仅第 0 片
  }

  const today = new Date().toISOString().slice(0, 10)
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from({ length: shardCount }, (_, n) => `  <sitemap>
    <loc>${escapeXml(`${siteUrl}/sitemaps/${n}.xml`)}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`
}

// 后台全量重建：重建全部有效分片 + index，删除超出分片数的旧文件
async function refreshAll(): Promise<void> {
  const siteUrl = lastSiteUrl
  if (!siteUrl) return
  try {
    let shardCount = 1
    try {
      const data = await serverApi<PageResult<Book>>('/books', { params: { page: 1, page_size: 1 } })
      shardCount = Math.max(1, Math.ceil(data.total / BOOKS_PER_SHARD))
    } catch {
      return
    }

    for (let n = 0; n < shardCount; n++) {
      const xml = await buildSitemapShardXml(n, siteUrl)
      memCache.set(n, { xml, expires: Date.now() + DISK_TTL_MS })
      writeDiskCache(`${n}.xml`, xml)
    }
    const indexXml = await buildSitemapIndexXml(siteUrl)
    indexMemCache = { xml: indexXml, expires: Date.now() + DISK_TTL_MS }
    writeDiskCache(INDEX_FILE, indexXml)

    // 清理多余分片文件（书籍减少导致分片数下降时）
    try {
      for (const f of fs.readdirSync(SITEMAP_DIR)) {
        const m = /^(\d+)\.xml$/.exec(f)
        if (m && Number(m[1]) >= shardCount) fs.unlinkSync(path.join(SITEMAP_DIR, f))
      }
    } catch {
      // 目录不存在或不可读则忽略
    }
  } catch {
    // 后台重建失败不影响线上已有静态文件，下个周期重试
  }
}

// 启动每日后台刷新（幂等，多路由调用只启动一个）
export function ensureSitemapRefresh(siteUrl: string): void {
  lastSiteUrl = siteUrl
  try {
    const stored = fs.readFileSync(path.join(SITEMAP_DIR, SITE_URL_FILE), 'utf-8').trim()
    // 优先沿用已持久化的地址，避免域名变更前后台任务用错
    if (stored && stored !== siteUrl) lastSiteUrl = stored
    else writeDiskCache(SITE_URL_FILE, siteUrl)
  } catch {
    writeDiskCache(SITE_URL_FILE, siteUrl)
  }
  if (refreshTimer) return
  refreshTimer = setInterval(() => void refreshAll(), REFRESH_INTERVAL_MS)
  refreshTimer.unref?.()
  // 进程首次访问后立即异步预热一次，不阻塞当前请求
  void refreshAll()
}
