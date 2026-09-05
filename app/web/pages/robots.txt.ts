import type { GetServerSideProps } from 'next'
import { siteUrlFrom } from '@/lib/server-api'

export default function Robots() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const siteUrl = siteUrlFrom(req)
  const body = `User-agent: *
Allow: /
Disallow: /books
Disallow: /user/profile
Disallow: /user/security
Disallow: /book/writer
Disallow: /install

Sitemap: ${siteUrl}/sitemap.xml
`
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.write(body)
  res.end()
  return { props: {} }
}
