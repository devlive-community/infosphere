import type { GetServerSideProps } from 'next'
import { siteUrlFrom } from '@/lib/server-api'
import { buildSitemapIndex } from '@/lib/sitemap'

// sitemap index：按公开书籍数分片，分片内容见 /sitemaps/{n}.xml
export default function SitemapIndex() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const xml = await buildSitemapIndex(siteUrlFrom(req))
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(xml)
  res.end()
  return { props: {} }
}
