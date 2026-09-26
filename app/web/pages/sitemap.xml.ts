import type { GetServerSideProps } from 'next'
import { readSitemapFile } from '@/lib/sitemap'
import { serverApi, siteUrlFrom } from '@/lib/server-api'

interface SitemapEntry { path: string; lastmod: string }

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// liveSitemap 后台任务尚未生成静态文件时（如刚安装）的兜底：静态入口页 + 公开书籍详情页 + 已发布章节阅读页。
async function liveSitemap(base: string): Promise<string> {
  let entries: SitemapEntry[] = []
  try {
    entries = (await serverApi<{ entries: SitemapEntry[] }>('/sitemap')).entries || []
  } catch {
    entries = []
  }
  const urls = [
    ...['/', '/explore'].map((path) => ({ loc: base + path, lastmod: '' })),
    ...entries.map((entry) => ({ loc: base + entry.path, lastmod: entry.lastmod })),
  ]
  const body = urls
    .map((url) => {
      const lastmod = url.lastmod ? `<lastmod>${new Date(url.lastmod).toISOString()}</lastmod>` : ''
      return `  <url><loc>${escapeXml(url.loc)}</loc>${lastmod}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

// /sitemap.xml：优先读取 Go 后台任务生成的分片索引（每日重建，分片由 /sitemaps/[shard] 提供）；
// 静态文件尚未生成时实时生成一份，避免新站点在首次任务完成前返回 404。
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const xml = readSitemapFile('sitemap.xml') || await liveSitemap(siteUrlFrom(req).replace(/\/$/, ''))
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  res.write(xml)
  res.end()
  return { props: {} }
}

export default function SitemapIndex() {
  return null
}
