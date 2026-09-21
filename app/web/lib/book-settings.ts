import type { GetServerSideProps } from 'next'
import { authHeaderFrom, getSSRUser, getSiteConfig, isInstalled, serverApi } from './server-api'
import type { Book, BookAccess, User } from './types'

export interface BookSettingsProps {
  installed: true
  user: User
  book: Book
  site: Record<string, string>
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
    const [book, access, site] = await Promise.all([
      serverApi<Book>(`/books/slug/${encodeURIComponent(slug)}`, { headers }),
      serverApi<BookAccess>(`/books/slug/${encodeURIComponent(slug)}/access`, { headers }),
      getSiteConfig(),
    ])
    if (!access.can_manage) return { notFound: true }
    return { props: { installed: true, user, book, site } }
  } catch {
    return { notFound: true }
  }
}

// requireBookSettingsFeature 在 getBookSettingsProps 之上再加「插件启用」门禁：
// 该书籍设置 Tab 属于某个 feature 插件（如 watermark / content-collect / 多语言与版本），
// 插件禁用时直接 404，杜绝「插件已禁用但页面仍可通过 URL 直接访问」。features 传数组表示「任一启用即可」。
export function requireBookSettingsFeature(features: string | string[]): GetServerSideProps<BookSettingsProps> {
  const required = Array.isArray(features) ? features : [features]
  return async (ctx) => {
    const res = await getBookSettingsProps(ctx)
    if ('props' in res && res.props) {
      const props = res.props as BookSettingsProps
      const enabled = (props.site as unknown as { feature_plugins?: string[] }).feature_plugins || []
      if (!required.some((f) => enabled.includes(f))) return { notFound: true }
    }
    return res
  }
}
