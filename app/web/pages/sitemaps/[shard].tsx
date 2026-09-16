import type { GetServerSideProps } from 'next'
import { siteUrlFrom } from '@/lib/server-api'
import { BOOKS_PER_SHARD, buildSitemapShard } from '@/lib/sitemap'

// sitemap 分片：第 n 片 = 公开书籍列表第 n+1 页（每页 100 本）+ 各书公开章节阅读页
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

  const xml = await buildSitemapShard(shard, siteUrlFrom(req))
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  // 分片内容服务端已缓存 10 分钟，浏览器/CDN 可更长
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(xml)
  res.end()
  return { props: {} }
}
