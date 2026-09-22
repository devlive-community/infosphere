import type { GetServerSideProps } from 'next'
import { siteUrlFrom } from '@/lib/server-api'

export default function Robots() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const siteUrl = siteUrlFrom(req)
  // 禁止索引所有私有/需登录页面（后台、我的书、写作台与书籍设置、账户中心各页、认证流程）。
  // 保留 /user/[username] 公开作者主页可被索引，故只 Disallow 具体的账户私有子路径。
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /books
Disallow: /book/writer
Disallow: /book/settings
Disallow: /user/profile
Disallow: /user/security
Disallow: /user/oauth
Disallow: /user/notify
Disallow: /user/reading
Disallow: /user/follows
Disallow: /user/likes
Disallow: /user/favorites
Disallow: /user/trash
Disallow: /user/growth
Disallow: /user/achievements
Disallow: /install
Disallow: /login
Disallow: /register
Disallow: /reset-password
Disallow: /verify-email
Disallow: /oauth

Sitemap: ${siteUrl}/sitemap.xml
`
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.write(body)
  res.end()
  return { props: {} }
}
