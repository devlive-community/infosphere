import type { GetServerSideProps } from 'next'
import { readSitemapFile } from '@/lib/sitemap'

// sitemap 分片：读取 Go 后台任务生成的静态文件（每日重建）
export default function SitemapShard() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ res, params }) => {
  const raw = String(params?.shard ?? '')
  const shard = Number.parseInt(raw.replace(/\.xml$/i, ''), 10)
  if (!Number.isInteger(shard) || shard < 0 || `${shard}.xml` !== raw.toLowerCase()) {
    res.statusCode = 404
    res.end()
    return { props: {} }
  }

  const xml = readSitemapFile(`${shard}.xml`)
  if (!xml) {
    res.statusCode = 404
    res.end()
    return { props: {} }
  }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(xml)
  res.end()
  return { props: {} }
}
