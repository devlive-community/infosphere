import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { serverApi, getSiteConfig, siteUrlFrom } from '@/lib/server-api'
import BookCard from '@/components/BookCard'
import { Button, Input, Pagination } from '@/components/ui'
import Seo from '@/components/Seo'
import type { Book, PageResult } from '@/lib/types'

interface ExploreProps {
  site: Record<string, string>
  siteUrl: string
  keyword: string
  page: number
  data: PageResult<Book>
}

export const getServerSideProps: GetServerSideProps<ExploreProps> = async ({ req, query }) => {
  const keyword = typeof query.title === 'string' ? query.title.slice(0, 100) : ''
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const [site, data] = await Promise.all([
    getSiteConfig(),
    serverApi<PageResult<Book>>('/books', { params: { page, page_size: 12, title: keyword || undefined } })
      .catch(() => ({ items: [], total: 0, page: 1, page_size: 12 }) as PageResult<Book>),
  ])
  return { props: { site, siteUrl: siteUrlFrom(req), keyword, page, data } }
}

export default function Explore({ site, siteUrl, keyword, page, data }: InferGetServerSidePropsType<typeof getServerSideProps>) {
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

  return (
    <div>
      <Seo
        siteName={siteName}
        title={keyword ? `「${keyword}」的搜索结果` : '发现知识'}
        description={keyword ? `在 ${siteName} 中搜索「${keyword}」的相关书籍` : `浏览 ${siteName} 中全部公开的知识书籍，发现值得收藏的内容。`}
        url={`${siteUrl}/explore${page > 1 ? `?page=${page}` : ''}`}
        jsonLd={jsonLd}
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900">{keyword ? `「${keyword}」的搜索结果` : '发现知识'}</h1>
        <form action="/explore" method="get" className="flex gap-2">
          <Input className="w-56" name="title" placeholder="搜索书籍标题" defaultValue={keyword} />
          <Button type="submit">搜索</Button>
        </form>
      </div>

      {data.items.length === 0 ? (
        <p className="py-20 text-center text-slate-400">
          {keyword ? '没有找到相关书籍' : '还没有公开的书籍，创建一本吧！'}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
          <Pagination page={data.page} pageSize={data.page_size} total={data.total}
            onChange={(p) => { window.location.search = p > 1 ? `?page=${p}${keyword ? `&title=${encodeURIComponent(keyword)}` : ''}` : (keyword ? `?title=${encodeURIComponent(keyword)}` : '') }} />
        </>
      )}
    </div>
  )
}
