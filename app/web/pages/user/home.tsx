import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import Container from '@/components/Container'
import { getSSRUser, authHeaderFrom, serverApi, getSiteConfig, siteUrlFrom, isInstalled } from '@/lib/server-api'
import { formatDate } from '@/lib/api'
import BookCard from '@/components/BookCard'
import { Pagination } from '@/components/ui'
import Seo from '@/components/Seo'
import UserAvatar from '@/components/UserAvatar'
import type { Book, PageResult , User} from '@/lib/types'

interface UserProfile {
  id: number
  username: string
  avatar: string
  bio: string
  github_url: string
  role: string
  created_at: string
  public_book_count: number
}

interface UserHomeProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  profile: UserProfile
  books: PageResult<Book>
}

export const getServerSideProps: GetServerSideProps<UserHomeProps> = async ({ req, query, params }) => {
  // 未安装时强制进入安装向导（服务端重定向，不渲染任何内容）
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const auth = authHeaderFrom(req)
  const user = await getSSRUser(req)

  const username = (typeof params?.username === 'string' ? params.username : '') || (typeof query.username === 'string' ? query.username : '')
  if (!username) return { notFound: true }
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)

  const [site, profile] = await Promise.all([
    getSiteConfig(),
    serverApi<UserProfile>(`/users/${encodeURIComponent(username)}`).catch(() => null),
  ])
  if (!profile) return { notFound: true }

  const books = await serverApi<PageResult<Book>>(`/users/${encodeURIComponent(username)}/books`, { params: { page, page_size: 9 } })
    .catch(() => ({ items: [], total: 0, page: 1, page_size: 9 }) as PageResult<Book>)

  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), profile, books } }
}

export default function UserHome({ site, siteUrl, profile, books }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const profileUrl = `${siteUrl}/user/home?username=${encodeURIComponent(profile.username)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: profile.username,
      description: profile.bio || undefined,
      url: profileUrl,
      sameAs: profile.github_url || undefined,
    },
  }

  return (
    <Container>
      <div>
      <Seo
        siteName={siteName}
        title={`${profile.username}的主页`}
        description={profile.bio || `${siteName} 用户 ${profile.username}，发布了 ${profile.public_book_count} 本公开书籍。`}
        url={profileUrl}
        jsonLd={jsonLd}
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-6 flex items-center gap-5 p-6">
        <UserAvatar user={profile} size="h-16 w-16 text-2xl" link={false} />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{profile.username}
            {profile.role === 'admin' && <span className="ml-2 inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">管理员</span>}
          </h1>
          {profile.bio && <p className="mt-1 text-sm text-slate-500">{profile.bio}</p>}
          <p className="mt-1 text-xs text-slate-400">
            加入于 {formatDate(profile.created_at).slice(0, 10)} · {profile.public_book_count} 本公开书籍
            {profile.github_url && <> · <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">GitHub</a></>}
          </p>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-bold text-slate-900">公开书籍</h2>
      {(books.items || []).length === 0 ? (
        <p className="py-16 text-center text-slate-400">暂无公开书籍</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(books.items || []).map((b) => <BookCard key={b.id} book={b} />)}
        </div>
      )}
      <Pagination page={books.page} pageSize={books.page_size} total={books.total}
        onChange={(p) => { window.location.search = p > 1 ? `?username=${encodeURIComponent(profile.username)}&page=${p}` : `?username=${encodeURIComponent(profile.username)}` }} />
    </div>
    </Container>
  )
}
