import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { getSSRUser, authHeaderFrom, serverApi, getSiteConfig, siteUrlFrom, isInstalled } from '@/lib/server-api'
import { formatDate, formatNumber } from '@/lib/api'
import { ButtonLink, EmptyState } from '@/components/ui'
import HeroIllustration, { HotRankCard } from '@/components/HeroIllustration'
import Seo from '@/components/Seo'
import UserAvatar from '@/components/UserAvatar'
import Container from '@/components/Container'
import TagChips from '@/components/TagChips'
import { API_BASE } from '@/lib/api'
import { BookIcon, ChevronRightIcon, CloudIcon, CodeIcon, EyeIcon, FileTextIcon, ShieldIcon, UsersIcon } from '@/components/icons'
import type { Book, SiteStats , User} from '@/lib/types'

interface HomeProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  stats: SiteStats
  latest: Book[]
  hot: Book[]
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ req }) => {
  // 未安装时强制进入安装向导（服务端重定向，不渲染任何内容）
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const auth = authHeaderFrom(req)
  const user = await getSSRUser(req)

  const [site, stats, latest, hot] = await Promise.all([
    getSiteConfig(),
    serverApi<SiteStats>('/stats').catch(() => null),
    serverApi<Book[]>('/explore/latest').catch(() => []),
    serverApi<Book[]>('/explore/hot').catch(() => []),
  ])
  return {
    props: {
      installed: true,
      user,
      site,
      siteUrl: siteUrlFrom(req),
      stats: stats ?? { user_count: 0, book_count: 0, document_count: 0, total_views: 0 },
      latest,
      hot,
    },
  }
}

// 首页最新发布横向卡片
function LatestCard({ book }: { book: Book }) {
  const cover = book.cover_image ? API_BASE + book.cover_image : ''
  return (
    <Link href={`/book/detail/${encodeURIComponent(book.slug)}`}
      className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className={`h-28 w-28 shrink-0 overflow-hidden rounded-lg ${cover ? '' : 'bg-gradient-to-br from-primary-300 to-[#8B8DFF]'}`}>
        {cover && <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate font-semibold text-slate-900 group-hover:text-primary-600">{book.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">{book.description || '暂无简介'}</p>
        <div className="mt-2"><TagChips tags={book.tags} max={2} link={false} /></div>
        <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-slate-400">
          <UserAvatar user={book.user} size="h-5 w-5" />
          <span>{book.user?.username || '佚名'}</span>
          <span>·</span>
          <span>{formatDate(book.created_at).slice(0, 10)}</span>
          <span className="ml-auto flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>
        </div>
      </div>
    </Link>
  )
}

export default function Home({ site, siteUrl, stats, latest, hot }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    description: site.site_description || 'InfoSphere 知识管理系统',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/explore?title={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  const statItems = [
    { label: '注册用户', value: stats.user_count, icon: UsersIcon, tone: 'bg-primary-50 text-primary-500' },
    { label: '知识书籍', value: stats.book_count, icon: BookIcon, tone: 'bg-sky-50 text-sky-500' },
    { label: '文档章节', value: stats.document_count, icon: FileTextIcon, tone: 'bg-emerald-50 text-emerald-500' },
    { label: '总浏览量', value: stats.total_views, icon: EyeIcon, tone: 'bg-amber-50 text-amber-500' },
  ]

  return (
    <div>
      <Seo
        siteName={siteName}
        description={site.site_description || '简单而强大的开源知识管理系统，支持多数据库与多端访问。'}
        url={siteUrl}
        jsonLd={jsonLd}
      />

      <Container>
      {/* Hero */}
      <section className="grid items-center gap-10 py-8 lg:grid-cols-2 lg:py-12">
        <div>
          <span className="mb-6 block h-1 w-12 rounded-full bg-primary-500" aria-hidden="true" />
          <h1 className="text-4xl font-bold leading-[1.15] text-slate-900 md:text-[44px] md:leading-[1.15]">
            让知识沉淀，<br />也让灵感流动
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-slate-500">
            一个属于你自己的开源知识空间。写作、整理、发布与阅读，在同一个地方自然发生。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/explore">探索知识</ButtonLink>
            <ButtonLink href="/books/create" variant="outline"
              className="border-primary-500 text-primary-600 hover:border-primary-600 hover:bg-primary-50">
              创建第一本书
            </ButtonLink>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
            <span className="flex items-center gap-1.5"><CodeIcon className="h-4 w-4 text-primary-500" /> 开源</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1.5"><ShieldIcon className="h-4 w-4 text-primary-500" /> 自托管</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1.5"><CloudIcon className="h-4 w-4 text-primary-500" /> 多端同步</span>
          </div>
        </div>
        <HeroIllustration books={latest} />
      </section>

      {/* 统计条 */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
          {statItems.map((s) => (
            <div key={s.label} className="flex items-center gap-4 p-6">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${s.tone}`}>
                <s.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xl font-bold tabular-nums text-slate-900">{s.value.toLocaleString('en-US')}</span>
                <span className="text-xs text-slate-400">{s.label}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 最新发布 */}
      <section className="mt-12">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">最新发布</h2>
          <Link href="/explore" className="flex items-center gap-0.5 text-sm text-slate-500 transition-colors hover:text-primary-600">
            查看全部 <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
        {latest.length === 0 ? (
          <EmptyState>
            还没有公开的书籍，<Link href="/books/create" className="text-primary-600 hover:underline">创建第一本</Link>
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(latest || []).slice(0, 3).map((b) => <LatestCard key={b.id} book={b} />)}
          </div>
        )}
      </section>
      </Container>

      {/* 热门阅读（全宽深色榜） */}
      {hot.length > 0 && (
        <section className="bg-[#0b1f3f] py-12">
          <Container>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">热门阅读</h2>
              <Link href="/explore" className="flex items-center gap-0.5 text-sm text-slate-400 transition-colors hover:text-white">
                查看全部 <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {(hot || []).slice(0, 5).map((b, i) => <HotRankCard key={b.id} rank={i + 1} book={b} />)}
            </div>
          </Container>
        </section>
      )}
    </div>
  )
}
