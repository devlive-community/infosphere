import { useState } from 'react'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import Container from '@/components/Container'
import { authHeaderFrom, getSSRUser, serverApi, getSiteConfig, siteUrlFrom, isInstalled } from '@/lib/server-api'
import { formatNumber } from '@/lib/api'
import { Pagination, Select } from '@/components/ui'
import Seo from '@/components/Seo'
import UserAvatar from '@/components/UserAvatar'
import { ArrowRightIcon, BookIcon, CalendarIcon, EyeIcon, GitHubIcon, GridIcon, ListIcon, ShareIcon } from '@/components/icons'
import TagChips from '@/components/TagChips'
import type { Book, PageResult, User } from '@/lib/types'

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

function joinYear(input: string | null | undefined): string {
  if (!input) return ''
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月加入`
}

// AuthorProfileCard 用户 Hero 卡：大圆头像 + 简介 + 统计 + GitHub/分享 + 知识网络插画
function AuthorProfileCard({ profile, siteUrl, share }: { profile: UserProfile; siteUrl: string; share: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid items-center gap-8 p-8 lg:grid-cols-[200px_1fr_320px]">
        {/* 左：大圆头像 */}
        <div className="mx-auto lg:mx-0">
          <UserAvatar user={profile} size="h-40 w-40 lg:h-48 lg:w-48 text-5xl" link={false} />
        </div>

        {/* 中：身份信息 */}
        <div className="min-w-0">
          <p className="text-sm text-slate-400">知识创作者</p>
          <h1 className="mt-1 flex items-center gap-3 text-4xl font-bold text-ink">
            {profile.username}
            {profile.role === 'admin' && (
              <span className="inline-flex items-center rounded-md bg-primary-50 px-2.5 py-1 text-sm font-medium text-primary-700 ring-1 ring-inset ring-primary-200">管理员</span>
            )}
          </h1>
          {profile.bio && <p className="mt-3 max-w-lg text-[15px] leading-7 text-slate-500">{profile.bio}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
            {profile.created_at && (
              <span className="flex items-center gap-1.5"><CalendarIcon className="h-4 w-4" /> {joinYear(profile.created_at)}</span>
            )}
            <span className="flex items-center gap-1.5"><BookIcon className="h-4 w-4" /> {profile.public_book_count} 本公开书籍</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {profile.github_url && (
              <a href={profile.github_url} target="_blank" rel="noopener noreferrer"
                className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400">
                <GitHubIcon className="h-4 w-4" /> 访问 GitHub
              </a>
            )}
            <button onClick={share} title="分享主页"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700">
              <ShareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 右：知识网络插画（装饰） */}
        <KnowledgeNetwork />
      </div>
    </div>
  )
}

// KnowledgeNetwork 装饰性知识节点网络（与首页 Hero 同一视觉语言）
function KnowledgeNetwork() {
  return (
    <div className="relative hidden h-56 select-none lg:block" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 220" fill="none">
        <path d="M30 60 C 100 120, 200 30, 290 70" stroke="#c9d9f8" strokeWidth="1.5" strokeDasharray="1 6" strokeLinecap="round" />
        <path d="M20 160 C 120 200, 220 150, 300 180" stroke="#d8e3fb" strokeWidth="1.5" strokeDasharray="1 6" strokeLinecap="round" />
        <path d="M70 20 C 140 100, 190 190, 260 40" stroke="#d8e3fb" strokeWidth="1.5" strokeDasharray="1 6" strokeLinecap="round" />
        <path d="M40 110 L 200 90 M 200 90 L 280 150 M 200 90 L 150 200" stroke="#e2eafc" strokeWidth="1.5" />
        {[[30, 60], [290, 70], [20, 160], [300, 180], [70, 20], [40, 110], [200, 90], [280, 150], [150, 200], [260, 40]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 4 : 3} fill={i % 3 === 0 ? '#8fb2f5' : '#c9d9f8'} />
        ))}
      </svg>
      {/* 节点上的小文档卡 */}
      {[[190, 10], [40, 60], [230, 150]].map(([x, y], i) => (
        <span key={i} className="absolute rounded-lg border border-slate-100 bg-white p-1.5 shadow-sm"
          style={{ left: `${(x / 320) * 100}%`, top: `${(y / 220) * 100}%` }}>
          <span className="block h-10 w-8 rounded bg-gradient-to-br from-primary-100 to-[#B9E4D0]/60" />
        </span>
      ))}
    </div>
  )
}

// PublicBookCard 公开书籍宽图卡片（原型样式：宽封面 + 标签 + meta + 作者条）
function PublicBookCard({ book, author }: { book: Book; author: UserProfile }) {
  const cover = book.cover_image ? (/^https?:\/\//.test(book.cover_image) ? book.cover_image : `/uploads/${book.cover_image.replace(/^\//, '')}`) : ''
  return (
    <a href={`/book/detail/${encodeURIComponent(book.slug)}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
        {cover && <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />}
        {cover && (
          <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 opacity-0 shadow transition-opacity duration-200 group-hover:opacity-100">
            <ArrowRightIcon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <TagChips tags={book.tags} max={1} link={false} />
        <h3 className="mt-2 truncate font-semibold text-slate-900 group-hover:text-primary-600">{book.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{book.description || '暂无简介'}</p>
        <div className="mt-auto flex items-center gap-4 pt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>
          <span className="flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> 更新于 {book.updated_at?.slice(0, 10)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        <UserAvatar user={author} size="h-5 w-5" link={false} />
        <span className="text-xs text-slate-500">{author.username}</span>
      </div>
    </a>
  )
}

export default function UserHome({ site, siteUrl, profile, books }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const [view, setView] = useState<'grid' | 'list'>('grid')
  type SortKey = 'updated' | 'views' | 'title'
  const sortOptions = [
    { value: 'updated', label: '最近更新' },
    { value: 'views', label: '浏览最多' },
    { value: 'title', label: '标题排序' },
  ]
  const [sort, setSort] = useState<SortKey>('updated')
  const profileUrl = `${siteUrl}/user/home?username=${encodeURIComponent(profile.username)}`

  async function share() {
    try {
      await navigator.clipboard.writeText(profileUrl)
      alert('主页链接已复制到剪贴板')
    } catch {
      window.prompt('复制以下链接分享主页', profileUrl)
    }
  }

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

  const items = [...(books.items || [])].sort((a, b) => {
    if (sort === 'views') return b.view_count - a.view_count
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN')
    return a.updated_at < b.updated_at ? 1 : -1
  })

  return (
    <Container>
      <Seo
        siteName={siteName}
        title={`${profile.username}的主页`}
        description={profile.bio || `${siteName} 用户 ${profile.username}，发布了 ${profile.public_book_count} 本公开书籍。`}
        url={profileUrl}
        jsonLd={jsonLd}
      />

      <div className="py-6">
        <AuthorProfileCard profile={profile} siteUrl={siteUrl} share={share} />

        {/* 公开书籍 */}
        <section className="mt-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-ink">公开书籍</h2>
              <span className="text-sm text-slate-400">{profile.username}发布的 {books.total} 本知识作品</span>
            </div>
            <div className="flex items-center gap-2">
              <Select className="w-36" value={sort} onChange={(v) => setSort(v as SortKey)} options={sortOptions} />
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                <button onClick={() => setView('grid')} aria-label="网格视图"
                  className={`flex h-10 w-10 items-center justify-center transition-colors ${view === 'grid' ? 'bg-primary-50 text-primary-600' : 'bg-white text-slate-400 hover:text-slate-700'}`}>
                  <GridIcon className="h-4 w-4" />
                </button>
                <button onClick={() => setView('list')} aria-label="列表视图"
                  className={`flex h-10 w-10 items-center justify-center border-l border-slate-200 transition-colors ${view === 'list' ? 'bg-primary-50 text-primary-600' : 'bg-white text-slate-400 hover:text-slate-700'}`}>
                  <ListIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="py-16 text-center text-slate-400">暂无公开书籍</p>
          ) : (
            <div className={view === 'grid' ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
              {items.map((b) => <PublicBookCard key={b.id} book={b} author={profile} />)}
            </div>
          )}
        </section>
      </div>

      <Pagination page={books.page} pageSize={books.page_size} total={books.total}
        onChange={(p) => { window.location.search = p > 1 ? `?username=${encodeURIComponent(profile.username)}&page=${p}` : `?username=${encodeURIComponent(profile.username)}` }} />
    </Container>
  )
}
