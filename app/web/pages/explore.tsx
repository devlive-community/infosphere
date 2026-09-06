import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { useEffect, useState } from 'react'
import { authHeaderFrom, getSSRUser, getSiteConfig, isInstalled, serverApi, siteUrlFrom } from '@/lib/server-api'
import { formatNumber } from '@/lib/api'
import Container from '@/components/Container'
import { Button, Input, Loading, Pagination, Select } from '@/components/ui'
import Seo from '@/components/Seo'
import TagChips from '@/components/TagChips'
import UserAvatar from '@/components/UserAvatar'
import { ArrowRightIcon, BookIcon, ClockIcon, EyeIcon, GlobeIcon, GridIcon, ListIcon, SearchIcon } from '@/components/icons'
import type { Book, PageResult, Tag, User } from '@/lib/types'

interface ExploreProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  keyword: string
  tag: string
  sort: 'latest' | 'hot'
  page: number
  data: PageResult<Book>
  hotTags: Tag[]
}

export const getServerSideProps: GetServerSideProps<ExploreProps> = async ({ req, query }) => {
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const auth = authHeaderFrom(req)
  const user = await getSSRUser(req)

  const keyword = typeof query.title === 'string' ? query.title.slice(0, 100) : ''
  const tag = typeof query.tag === 'string' ? query.tag.slice(0, 50) : ''
  const sort = (query.sort === 'hot' ? 'hot' : 'latest') as 'latest' | 'hot'
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)

  const [site, data, hotTags] = await Promise.all([
    getSiteConfig(),
    tag
      ? serverApi<PageResult<Book>>(`/tags/${encodeURIComponent(tag)}/books`, { params: { page, page_size: 12 } })
          .catch(() => ({ items: [], total: 0, page: 1, page_size: 12 }) as PageResult<Book>)
      : serverApi<PageResult<Book>>('/books', { params: { page, page_size: 12, title: keyword || undefined } })
          .catch(() => ({ items: [], total: 0, page: 1, page_size: 12 }) as PageResult<Book>),
    serverApi<Tag[]>('/tags', { params: { limit: 6 } }).catch(() => [] as Tag[]),
  ])
  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), keyword, tag, sort, page, data, hotTags } }
}

// ExploreCard 发现页宽图卡
function ExploreCard({ book }: { book: Book }) {
  const cover = book.cover_image
    ? (/^https?:\/\//.test(book.cover_image) ? book.cover_image : `/uploads/${book.cover_image.replace(/^\//, '')}`)
    : ''
  const date = book.updated_at?.slice(0, 10) || book.created_at?.slice(0, 10)
  return (
    <a href={`/book/detail/${encodeURIComponent(book.slug)}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[16/8] w-full overflow-hidden bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
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
        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3 mt-3">
          <UserAvatar user={book.user} size="h-5 w-5" link={false} />
          <span className="truncate text-xs text-slate-500">{book.user?.username || '佚名'}</span>
          <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>
            <span>{date}</span>
          </span>
        </div>
      </div>
    </a>
  )
}

// ExploreRowCard 列表视图行卡
function ExploreRowCard({ book }: { book: Book }) {
  const cover = book.cover_image
    ? (/^https?:\/\//.test(book.cover_image) ? book.cover_image : `/uploads/${book.cover_image.replace(/^\//, '')}`)
    : ''
  return (
    <a href={`/book/detail/${encodeURIComponent(book.slug)}`}
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
        {cover
          ? <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <span className="flex h-full w-full items-center justify-center text-xl font-bold text-white/80">{book.title.slice(0, 1)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-semibold text-slate-900 group-hover:text-primary-600">{book.title}</span>
          <TagChips tags={book.tags} max={1} link={false} />
        </div>
        <p className="mt-0.5 truncate text-sm text-slate-500">{book.description || '暂无简介'}</p>
        <div className="mt-1 flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>
          <span>{book.updated_at?.slice(0, 10) || book.created_at?.slice(0, 10)}</span>
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2 text-sm text-slate-400">
        <UserAvatar user={book.user} size="h-6 w-6" link={false} />
        {book.user?.username || '佚名'}
        <ArrowRightIcon className="h-4 w-4 text-slate-300 transition-colors group-hover:text-primary-500" />
      </span>
    </a>
  )
}

export default function Explore({ site, siteUrl, keyword, tag, sort, page, data, hotTags }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [loading, setLoading] = useState(false)
  useEffect(() => { setLoading(false) }, [data, tag, page])

  const browseItems = [
    { mode: 'all' as const, label: '全部公开书籍', icon: <BookIcon className="h-4 w-4" />, href: '/explore' },
    { mode: 'latest' as const, label: '最新发布', icon: <ClockIcon className="h-4 w-4" />, href: '/explore?sort=latest' },
    { mode: 'hot' as const, label: '热门阅读', icon: <i className="fa-solid fa-fire text-sm" aria-hidden="true" />, href: '/explore?sort=hot' },
  ]

  const items = [...(data.items || [])].sort((a, b) => {
    if (!tag && sort === 'hot') return b.view_count - a.view_count
    if (!tag && sort === 'latest') return a.updated_at < b.updated_at ? 1 : -1
    return 0
  })

  const sectionTitle = tag ? `标签「${tag}」下的书籍` : keyword ? `「${keyword}」的搜索结果` : '全部公开书籍'

  const jsonLd = items.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.slice(0, 10).map((book, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/book/detail/${encodeURIComponent(book.slug)}`,
      name: book.title,
    })),
  } : undefined

  function pageUrl(p: number): string {
    const params = new URLSearchParams()
    if (keyword) params.set('title', keyword)
    if (tag) params.set('tag', tag)
    if (sort !== 'latest') params.set('sort', sort)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/explore${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="bg-warm">
      <Seo
        siteName={siteName}
        title={keyword ? `「${keyword}」的搜索结果` : '发现知识'}
        description={keyword ? `在 ${siteName} 中搜索「${keyword}」的相关书籍` : `浏览 ${siteName} 中全部公开的知识书籍，从不同作者的经验与思考中获得新的连接。`}
        url={`${siteUrl}/explore`}
        jsonLd={jsonLd}
      />

      {/* Hero：居中标题 + 大搜索框 + 热门搜索 */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-primary-50/60 to-warm">
        <Container className="py-10 text-center">
          <p className="text-sm font-medium tracking-wide text-primary-600">开放知识广场</p>
          <h1 className="mt-2 text-3xl font-bold text-ink md:text-4xl">发现值得反复阅读的知识作品</h1>
          <p className="mt-3 text-[15px] text-slate-500">浏览社区公开发布的书籍，从不同作者的经验与思考中获得新的连接。</p>

          <form action="/explore" method="get" className="mx-auto mt-6 flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input className="h-12 pl-11 text-base" name="title" placeholder="搜索书名、主题或作者" defaultValue={keyword} />
            </div>
            <Button type="submit" className="h-12 px-7 text-base">搜索</Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-slate-400">热门搜索</span>
            {(hotTags || []).slice(0, 4).map((t) => (
              <Link key={t.id} href={`/explore?tag=${encodeURIComponent(t.slug)}`}
                className="rounded-full px-2.5 py-1 text-primary-600 transition-colors hover:bg-primary-50">{t.name}</Link>
            ))}
          </div>
        </Container>
      </section>

      {/* 主体：左栏浏览 + 右内容 */}
      <Container className="grid gap-8 py-8 lg:grid-cols-[240px_1fr]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20">
          <h2 className="mb-2 px-2 text-sm font-semibold text-slate-900">浏览内容</h2>
          <ul className="space-y-0.5">
            {browseItems.map((item) => {
              const active = !tag && ((sort === 'hot' && item.mode === 'hot') || (sort === 'latest' && item.mode !== 'hot'))
              return (
                <li key={item.mode}>
                  <Link href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      active ? 'bg-primary-50 font-medium text-primary-700 ring-1 ring-inset ring-primary-100' : 'text-slate-600 hover:bg-slate-50'
                    }`}>
                    {item.icon} {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <h2 className="mb-2 px-2 text-sm font-semibold text-slate-900">热门标签</h2>
            <ul className="space-y-0.5">
              {(hotTags || []).map((t) => (
                <li key={t.id}>
                  <Link href={`/explore?tag=${encodeURIComponent(t.slug)}`}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      tag === t.slug ? 'bg-primary-50 font-medium text-primary-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}>
                    {t.name}
                    <span className="text-xs text-slate-400">{t.book_count}</span>
                  </Link>
                </li>
              ))}
              {(hotTags || []).length === 0 && <li className="px-3 py-2 text-xs text-slate-400">暂无标签</li>}
            </ul>
          </div>

          <p className="mt-4 flex items-start gap-1.5 px-2 text-xs leading-5 text-slate-400">
            <GlobeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            这里只展示公开且已发布的内容
          </p>
        </aside>

        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-ink">{sectionTitle}</h2>
              <span className="text-sm text-slate-400">共 {data.total} 本</span>
            </div>
            <div className="flex items-center gap-2">
              {!tag && (
                <Select className="w-36" value={sort} onChange={(v) => { setLoading(true); window.location.href = v === 'hot' ? '/explore?sort=hot' : '/explore' }}
                  options={[{ value: 'latest', label: '最新发布' }, { value: 'hot', label: '热门阅读' }]} />
              )}
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

          {loading ? (
            <Loading />
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-20 text-center text-sm text-slate-400">
              {keyword ? '没有找到相关书籍' : tag ? '该标签下暂无书籍' : '还没有公开的书籍，创建一本吧！'}
            </div>
          ) : (
            <div className={view === 'grid' ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
              {items.map((b) => view === 'grid' ? <ExploreCard key={b.id} book={b} /> : <ExploreRowCard key={b.id} book={b} />)}
            </div>
          )}

          {!loading && items.length > 0 && (
            <Pagination page={data.page} pageSize={data.page_size} total={data.total}
              onChange={(p) => { setLoading(true); window.location.href = pageUrl(p) }} />
          )}
        </section>
      </Container>
    </div>
  )
}
