import Link from 'next/link'
import Container from '@/components/Container'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { authHeaderFrom, getSSRUser, getSiteConfig, isInstalled, serverApi, siteUrlFrom } from '@/lib/server-api'
import TagChips from '@/components/TagChips'
import { EyeIcon } from '@/components/icons'
import { Button, Input, Pagination } from '@/components/ui'
import { formatDate } from '@/lib/api'
import Seo from '@/components/Seo'
import type { Book, PageResult, User } from '@/lib/types'

interface ExploreProps {
  tag: string
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  keyword: string
  page: number
  data: PageResult<Book>
}

export const getServerSideProps: GetServerSideProps<ExploreProps> = async ({ req, query }) => {
  // 未安装时强制进入安装向导（服务端重定向，不渲染任何内容）
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const auth = authHeaderFrom(req)
  const user = await getSSRUser(req)

  const keyword = typeof query.title === 'string' ? query.title.slice(0, 100) : ''
  const tag = typeof query.tag === 'string' ? query.tag.slice(0, 50) : ''
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const [site, data] = await Promise.all([
    getSiteConfig(),
    serverApi<PageResult<Book>>('/books', { params: { page, page_size: 12, title: keyword || undefined, tag: tag || undefined } })
      .catch(() => ({ items: [], total: 0, page: 1, page_size: 12 }) as PageResult<Book>),
  ])
  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), keyword, tag, page, data } }
}

// ExploreMediaCard 发现页媒体卡片（与「我的书籍」卡片同构）
function ExploreMediaCard({ book }: { book: Book }) {
  return (
    <Link href={`/book/detail?slug=${encodeURIComponent(book.slug)}`}
      className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex gap-4">
        <div className="h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
          {book.cover_image
            ? <img src={book.cover_image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            : <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/80">{book.title.slice(0, 1)}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="min-w-0 truncate font-semibold text-slate-900 group-hover:text-primary-600">{book.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{book.description || '暂无简介'}</p>
          <div className="mt-1.5"><TagChips tags={book.tags} max={3} link={false} /></div>
          <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-slate-400">
            {book.user?.avatar
              ? <img src={book.user.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
              : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">{book.user?.username?.[0]?.toUpperCase() || '?'}</span>}
            <span>{book.user?.username || '佚名'}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {book.view_count}</span>
            <span className="ml-auto">{formatDate(book.created_at).slice(0, 10)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function Explore({ site, siteUrl, keyword, tag, page, data }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'

  const jsonLd = data.items.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: data.items.slice(0, 10).map((book, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/book/detail?slug=${encodeURIComponent(book.slug)}`,
      name: book.title,
    })),
  } : undefined

  const hasItems = (data.items || []).length > 0

  return (
    <Container>
      <Seo
        siteName={siteName}
        title={keyword ? `「${keyword}」的搜索结果` : '发现知识'}
        description={keyword ? `在 ${siteName} 中搜索「${keyword}」的相关书籍` : `浏览 ${siteName} 中全部公开的知识书籍，发现值得收藏的内容。`}
        url={`${siteUrl}/explore${page > 1 ? `?page=${page}` : ''}`}
        jsonLd={jsonLd}
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900">{tag ? `标签「${tag}」下的书籍` : keyword ? `「${keyword}」的搜索结果` : '发现知识'}</h1>
        <form action="/explore" method="get" className="flex gap-2">
          <Input className="w-56" name="title" placeholder="搜索书籍标题" defaultValue={keyword} />
          <Button type="submit">搜索</Button>
        </form>
      </div>

      {!hasItems ? (
        <p className="py-20 text-center text-slate-400">
          {keyword ? '没有找到相关书籍' : '还没有公开的书籍，创建一本吧！'}
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data.items || []).map((book) => <ExploreMediaCard key={book.id} book={book} />)}
          </div>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total}
            onChange={(p) => { window.location.search = p > 1 ? `?page=${p}${keyword ? `&title=${encodeURIComponent(keyword)}` : ''}` : (keyword ? `?title=${encodeURIComponent(keyword)}` : '') }} />
        </div>
      )}
    </Container>
  )
}
