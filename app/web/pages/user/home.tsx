import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { serverApi, getSiteConfig, siteUrlFrom } from '@/lib/server-api'
import { formatDate } from '@/lib/api'
import BookCard, { Pagination } from '@/components/BookCard'
import Seo from '@/components/Seo'
import type { Book, PageResult } from '@/lib/types'

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
  site: Record<string, string>
  siteUrl: string
  profile: UserProfile
  books: PageResult<Book>
}

export const getServerSideProps: GetServerSideProps<UserHomeProps> = async ({ req, query, params }) => {
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

  return { props: { site, siteUrl: siteUrlFrom(req), profile, books } }
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
    <div>
      <Seo
        siteName={siteName}
        title={`${profile.username}的主页`}
        description={profile.bio || `${siteName} 用户 ${profile.username}，发布了 ${profile.public_book_count} 本公开书籍。`}
        url={profileUrl}
        jsonLd={jsonLd}
      />

      <div className="card mb-6 flex items-center gap-5 p-6">
        {profile.avatar
          ? <img src={profile.avatar} alt={profile.username} className="h-16 w-16 rounded-full object-cover" />
          : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-500 text-2xl font-bold text-white">{profile.username[0]?.toUpperCase()}</span>}
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{profile.username}
            {profile.role === 'admin' && <span className="badge ml-2 bg-violet-50 text-violet-600">管理员</span>}
          </h1>
          {profile.bio && <p className="mt-1 text-sm text-slate-500">{profile.bio}</p>}
          <p className="mt-1 text-xs text-slate-400">
            加入于 {formatDate(profile.created_at).slice(0, 10)} · {profile.public_book_count} 本公开书籍
            {profile.github_url && <> · <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">GitHub</a></>}
          </p>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-bold text-slate-900">公开书籍</h2>
      {books.items.length === 0 ? (
        <p className="py-16 text-center text-slate-400">暂无公开书籍</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.items.map((b) => <BookCard key={b.id} book={b} />)}
        </div>
      )}
      <Pagination page={books.page} pageSize={books.page_size} total={books.total}
        onChange={(p) => { window.location.search = p > 1 ? `?username=${encodeURIComponent(profile.username)}&page=${p}` : `?username=${encodeURIComponent(profile.username)}` }} />
    </div>
  )
}
