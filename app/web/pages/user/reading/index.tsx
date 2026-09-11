import { useEffect, useState } from 'react'
import Container from '@/components/Container'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { ButtonLink, EmptyState, Loading, Pagination } from '@/components/ui'
import BookCard from '@/components/BookCard'
import Seo from '@/components/Seo'
import { BookIcon } from '@/components/icons'
import type { Book } from '@/lib/types'

interface ReadingItem {
  book: Book
  read_count: number
  total_chapters: number
  percentage: number
  last_doc_slug: string
  last_doc_title: string
  last_read_at: string
}

interface ReadingPage {
  items: ReadingItem[]
  total: number
  page: number
  page_size: number
}

// ReadingCard 复用全站 BookCard（grid 视图），在底部操作区叠加进度条与「继续阅读」。
function ReadingCard({ item }: { item: ReadingItem }) {
  const { book, read_count, total_chapters, percentage, last_doc_slug, last_doc_title } = item
  const resumeUrl = last_doc_slug
    ? `/book/reader/${encodeURIComponent(book.slug)}/${encodeURIComponent(last_doc_slug)}`
    : `/book/detail/${encodeURIComponent(book.slug)}`
  return (
    <BookCard
      book={book}
      view="grid"
      showViews={false}
      meta={<span>已读 {read_count}/{total_chapters} 章</span>}
      actions={
        <div className="w-full">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="truncate">上次读到：{last_doc_title || '未开始'}</span>
            <span className="tabular-nums text-slate-400">{percentage}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-primary-500 transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <ButtonLink href={resumeUrl} className="mt-3 w-full justify-center">
            <BookIcon className="h-4 w-4" /> 继续阅读
          </ButtonLink>
        </div>
      }
    />
  )
}

export default function MyReading() {
  const user = useRequireAuth()
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ReadingPage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    api<ReadingPage>('/users/me/reading', { params: { page, page_size: 9 } })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: 9 }))
      .finally(() => setLoading(false))
  }, [user, page])

  if (!user) return <Loading className="min-h-[60vh]" label="正在验证登录状态…" />

  return (
    <>
      <Seo siteName={siteName} title="我在读" noindex />
      <Container>
        <div className="pb-6">
          <h1 className="text-2xl font-bold text-ink">我在读</h1>
          <p className="mt-1 text-sm text-slate-500">你正在阅读的全部书籍与进度</p>
        </div>

        {loading || data === null ? (
          <Loading label="正在加载阅读进度…" />
        ) : data.total === 0 ? (
          <EmptyState>还没有阅读记录，去发现页找一本开始阅读吧</EmptyState>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((item) => (
                <ReadingCard key={item.book.id} item={item} />
              ))}
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </>
        )}
      </Container>
    </>
  )
}
