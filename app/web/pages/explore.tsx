import Link from 'next/link'
import { useRouter } from 'next/router'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { useEffect, useState } from 'react'
import { authHeaderFrom, getSSRUser, getSiteConfig, isInstalled, serverApi, siteUrlFrom } from '@/lib/server-api'
import { formatNumber } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import Container from '@/components/Container'
import { Button, Input, Loading, Pagination, SegmentedTabs, Select } from '@/components/ui'
import Seo from '@/components/Seo'
import TagChips from '@/components/TagChips'
import BookCard from '@/components/BookCard'
import { ArrowRightIcon, BookIcon, ClockIcon, EyeIcon, GlobeIcon, GridIcon, ListIcon, SearchIcon } from '@/components/icons'
import type { Book, PageResult, Tag, User } from '@/lib/types'

interface ExploreProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  keyword: string
  tag: string
  tagName: string
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

  const [site, data, tags] = await Promise.all([
    getSiteConfig(),
    tag
      ? serverApi<PageResult<Book>>(`/tags/${encodeURIComponent(tag)}/books`, { params: { page, page_size: 12 } })
          .catch(() => ({ items: [], total: 0, page: 1, page_size: 12 }) as PageResult<Book>)
      : serverApi<PageResult<Book>>('/books', { params: { page, page_size: 12, title: keyword || undefined } })
          .catch(() => ({ items: [], total: 0, page: 1, page_size: 12 }) as PageResult<Book>),
    serverApi<Tag[]>('/tags', { params: { limit: 200 } }).catch(() => [] as Tag[]),
  ])
  const selectedBookTag = data.items
    .flatMap((book) => book.tags || [])
    .find((item) => item.slug === tag)
  const tagName = tag ? selectedBookTag?.name || tags.find((item) => item.slug === tag)?.name || tag : ''
  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), keyword, tag, tagName, sort, page, data, hotTags: tags.slice(0, 6) } }
}

export default function Explore({ site, siteUrl, keyword, tag, tagName, sort, page, data, hotTags }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  // 数据/筛选变化即视为加载完成，复位 loading（含 SSR 软导航返回新 props）
  useEffect(() => { setLoading(false) }, [data, tag, page, sort, keyword])

  // 目标地址与当前不同才进入加载态，避免点击当前项后 loading 卡住
  function navLoad(href: string) {
    if (href !== router.asPath) setLoading(true)
  }

  // 当前高亮的浏览项：按 URL 中的 sort 显式区分「全部公开书籍」(无 sort) 与「最新发布」(sort=latest)，
  // 保证同一时刻只有一个高亮；含标签筛选时三项均不高亮
  const rawSort = typeof router.query.sort === 'string' ? router.query.sort : ''
  const activeMode = tag ? '' : rawSort === 'hot' ? 'hot' : rawSort === 'latest' ? 'latest' : 'all'

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

  const sectionTitle = tag ? `标签「${tagName}」下的书籍` : keyword ? `「${keyword}」的搜索结果` : '全部公开书籍'

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
        <Container className="py-8 text-center sm:py-10">
          <p className="text-sm font-medium tracking-wide text-primary-600">开放知识广场</p>
          <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl md:text-4xl">发现值得反复阅读的知识作品</h1>
          <p className="mt-3 text-[15px] text-slate-500">浏览社区公开发布的书籍，从不同作者的经验与思考中获得新的连接。</p>

          <form action="/explore" method="get" className="mx-auto mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input size="lg" className="pl-11 text-base" name="title" placeholder="搜索书名、主题或作者" defaultValue={keyword} />
            </div>
            <Button type="submit" size="lg" className="w-full px-7 sm:w-auto">搜索</Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-slate-400">热门搜索</span>
            {(hotTags || []).slice(0, 4).map((t) => (
              <Link key={t.id} href={`/explore?tag=${encodeURIComponent(t.slug)}`} onClick={() => navLoad(`/explore?tag=${encodeURIComponent(t.slug)}`)}
                className="rounded-full px-2.5 py-1 text-primary-600 transition-colors hover:bg-primary-50">{t.name}</Link>
            ))}
          </div>
        </Container>
      </section>

      {/* 主体：左栏浏览 + 右内容 */}
      <Container className="grid gap-5 py-6 sm:py-8 lg:grid-cols-[240px_1fr] lg:gap-8">
        <div className="space-y-3 lg:hidden">
          <SegmentedTabs fullWidth value={activeMode} ariaLabel="浏览内容"
            items={browseItems.map((item) => ({ value: item.mode, label: item.label, icon: item.icon }))}
            onChange={(mode) => {
              const item = browseItems.find((entry) => entry.mode === mode)
              if (item) { navLoad(item.href); void router.push(item.href) }
            }} />
          {hotTags.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {hotTags.map((item) => <Link key={item.id} href={`/explore?tag=${encodeURIComponent(item.slug)}`}
              onClick={() => navLoad(`/explore?tag=${encodeURIComponent(item.slug)}`)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${tag === item.slug ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              {item.name} <span className="text-xs text-slate-400">{item.book_count}</span>
            </Link>)}
          </div>}
        </div>
        <aside className="hidden h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:block">
          <h2 className="mb-2 px-2 text-sm font-semibold text-slate-900">浏览内容</h2>
          <ul className="space-y-0.5">
            {browseItems.map((item) => {
              const active = item.mode === activeMode
              return (
                <li key={item.mode}>
                  <Link href={item.href} onClick={() => navLoad(item.href)}
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
                  <Link href={`/explore?tag=${encodeURIComponent(t.slug)}`} onClick={() => navLoad(`/explore?tag=${encodeURIComponent(t.slug)}`)}
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
            这里只展示公开且处于进行中、已发布或已完成状态的内容
          </p>
        </aside>

        <section>
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="min-w-0 text-xl font-bold text-ink sm:text-2xl">{sectionTitle}</h2>
              <span className="text-sm text-slate-400">共 {data.total} 本</span>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              {!tag && (
                <Select className="min-w-0 flex-1 sm:w-36 sm:flex-none" value={sort} onChange={(v) => { setLoading(true); window.location.href = v === 'hot' ? '/explore?sort=hot' : '/explore' }}
                  options={[{ value: 'latest', label: '最新发布' }, { value: 'hot', label: '热门阅读' }]} />
              )}
              <SegmentedTabs iconOnly value={view} ariaLabel="书籍展示方式"
                onChange={(value) => setView(value as 'grid' | 'list')} items={[
                  { value: 'grid', label: '网格视图', icon: <GridIcon className="h-4 w-4" /> },
                  { value: 'list', label: '列表视图', icon: <ListIcon className="h-4 w-4" /> },
                ]} />
            </div>
          </div>

          {loading ? (
            <Loading />
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-20 text-center text-sm text-slate-400">
              {keyword ? '没有找到相关书籍' : tag ? '该标签下暂无书籍' : '还没有公开的书籍，创建一本吧！'}
            </div>
          ) : (
            <div className={view === 'grid' ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
              {items.map((b) => <BookCard key={b.id} book={b} view={view} />)}
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
