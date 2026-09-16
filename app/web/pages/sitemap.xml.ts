import type { GetServerSideProps } from 'next'
import { serverApi, siteUrlFrom } from '@/lib/server-api'
import type { Book, Document, PageResult } from '@/lib/types'

// 动态 sitemap：静态页 + 全部公开书籍与公开章节阅读页
export default function Sitemap() {
  return null
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

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const siteUrl = siteUrlFrom(req)

  const staticPages = ['', '/explore', '/login', '/register'].map((p) => ({
    loc: `${siteUrl}${p}`,
    changefreq: 'daily',
    priority: p === '' ? '1.0' : '0.6',
  }))

  // URL 总量上限，防止极端数据把 sitemap 撑爆（单文件 sitemap 上限为 5 万）
  const MAX_URLS = 20000
  const contentEntries: { loc: string; lastmod: string }[] = []
  try {
    let page = 1
    let total = Infinity
    while (contentEntries.length < MAX_URLS && page * 100 < total + 100) {
      const data = await serverApi<PageResult<Book>>('/books', { params: { page, page_size: 100 } })
      total = data.total
      for (const book of data.items) {
        if (contentEntries.length >= MAX_URLS) break
        contentEntries.push({
          loc: `${siteUrl}/book/detail/${encodeURIComponent(book.slug)}`,
          lastmod: (book.updated_at || book.created_at || '').slice(0, 10),
        })
        // 匿名请求该接口，服务端仅返回公开书籍 + 已发布章节，与游客可见范围一致
        try {
          const docs = await serverApi<Document[]>(`/books/${book.id}/documents`)
          const docEntries: { loc: string; lastmod: string }[] = []
          flattenDocEntries(book.slug, docs, docEntries, MAX_URLS - contentEntries.length)
          contentEntries.push(...docEntries.map((d) => ({ ...d, loc: `${siteUrl}${d.loc}` })))
        } catch {
          // 单本书籍章节拉取失败不影响整体 sitemap
        }
      }
      if (data.items.length < 100) break
      page += 1
    }
  } catch {
    // API 不可用时输出静态页即可
  }

  const urls = [
    ...staticPages.map((p) => `  <url>
    <loc>${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...contentEntries.map((b) => `  <url>
    <loc>${b.loc}</loc>
    ${b.lastmod ? `<lastmod>${b.lastmod}</lastmod>` : ''}
  </url>`),
  ].join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(xml)
  res.end()
  return { props: {} }
}
