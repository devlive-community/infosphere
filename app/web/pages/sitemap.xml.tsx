import type { GetServerSideProps } from 'next'
import { serverApi, siteUrlFrom } from '@/lib/server-api'

interface SitemapEntry { path: string; lastmod: string }

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// /sitemap.xml：静态入口页 + 公开书籍详情页 + 已发布章节阅读页，供搜索引擎抓取。
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const base = siteUrlFrom(req).replace(/\/$/, '')
  const staticPaths = ['/', '/explore']
  let entries: SitemapEntry[] = []
  try {
    entries = (await serverApi<{ entries: SitemapEntry[] }>('/sitemap')).entries || []
  } catch {
    entries = []
  }
  const urls = [
    ...staticPaths.map((path) => ({ loc: base + path, lastmod: '' })),
    ...entries.map((entry) => ({ loc: base + entry.path, lastmod: entry.lastmod })),
  ]
  const body = urls
    .map((url) => {
      const lastmod = url.lastmod ? `<lastmod>${new Date(url.lastmod).toISOString()}</lastmod>` : ''
      return `  <url><loc>${escapeXml(url.loc)}</loc>${lastmod}</url>`
    })
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  res.write(xml)
  res.end()
  return { props: {} }
}

export default function SiteMapXml() {
  return null
}
