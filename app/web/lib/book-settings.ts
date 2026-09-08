import type { GetServerSideProps } from 'next'
import { authHeaderFrom, getSSRUser, isInstalled, serverApi } from './server-api'
import type { Book, BookAccess, User } from './types'

export interface BookSettingsProps {
  installed: true
  user: User
  book: Book
}

// getBookSettingsProps 书籍设置各 Tab 共用的 SSR 数据加载：
// 校验安装 → 要求登录 → 拉取书籍与访问权限，仅 can_manage 可进入，否则 404。
export const getBookSettingsProps: GetServerSideProps<BookSettingsProps> = async ({ req, params, resolvedUrl }) => {
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const user = await getSSRUser(req)
  if (!user) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } }
  }
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  if (!slug) return { notFound: true }
  const headers = authHeaderFrom(req)
  try {
    const [book, access] = await Promise.all([
      serverApi<Book>(`/books/slug/${encodeURIComponent(slug)}`, { headers }),
      serverApi<BookAccess>(`/books/slug/${encodeURIComponent(slug)}/access`, { headers }),
    ])
    if (!access.can_manage) return { notFound: true }
    return { props: { installed: true, user, book } }
  } catch {
    return { notFound: true }
  }
}
