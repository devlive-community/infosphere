import type { GetServerSideProps } from 'next'
import { serverApi, siteUrlFrom } from '@/lib/server-api'
import type { Book, PageResult } from '@/lib/types'

// 动态 sitemap：静态页 + 全部公开书籍与章节
export default function Sitemap() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const siteUrl = siteUrlFrom(req)

  const staticPages = ['', '/explore', '/login', '/register'].map((p) => ({
    loc: `${siteUrl}${p}`,
    changefreq: 'daily',
    priority: p === '' ? '1.0' : '0.6',
  }))

  const bookEntries: { loc: string; lastmod: string }[] = []
  try {
    let page = 1
    let total = Infinity
    while (bookEntries.length < 5000 && page * 100 < total + 100) {
      const data = await serverApi<PageResult<Book>>('/books', { params: { page, page_size: 100 } })
      total = data.total
      for (const book of data.items) {
        bookEntries.push({
          loc: `${siteUrl}/book/detail?slug=${encodeURIComponent(book.slug)}`,
          lastmod: (book.updated_at || book.created_at || '').slice(0, 10),
        })
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
    ...bookEntries.map((b) => `  <url>
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
