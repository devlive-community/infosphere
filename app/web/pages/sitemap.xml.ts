import type { GetServerSideProps } from 'next'
import { siteUrlFrom } from '@/lib/server-api'
import { ensureSitemapRefresh, getSitemapIndex } from '@/lib/sitemap'

// sitemap index：静态文件优先（每日后台重建），缺失/过期时按需构建兜底
export default function SitemapIndex() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const siteUrl = siteUrlFrom(req)
  ensureSitemapRefresh(siteUrl)
  const xml = await getSitemapIndex(siteUrl)
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(xml)
  res.end()
  return { props: {} }
}
