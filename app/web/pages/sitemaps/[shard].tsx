import type { GetServerSideProps } from 'next'
import { siteUrlFrom } from '@/lib/server-api'
import { ensureSitemapRefresh, getSitemapShard } from '@/lib/sitemap'

// sitemap 分片：静态文件优先（每日后台重建），缺失/过期时按需构建兜底
export default function SitemapShard() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ req, res, params }) => {
  const raw = String(params?.shard ?? '')
  const shard = Number.parseInt(raw.replace(/\.xml$/i, ''), 10)
  if (!Number.isInteger(shard) || shard < 0 || `${shard}.xml` !== raw.toLowerCase()) {
    res.statusCode = 404
    res.end()
    return { props: {} }
  }

  const siteUrl = siteUrlFrom(req)
  ensureSitemapRefresh(siteUrl)
  const xml = await getSitemapShard(shard, siteUrl)
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(xml)
  res.end()
  return { props: {} }
}
