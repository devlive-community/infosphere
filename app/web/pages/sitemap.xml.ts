import type { GetServerSideProps } from 'next'
import { readSitemapFile } from '@/lib/sitemap'

// sitemap index：读取 Go 后台任务生成的静态文件（每日重建）
export default function SitemapIndex() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const xml = readSitemapFile('sitemap.xml')
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
