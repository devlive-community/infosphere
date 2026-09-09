import { useEffect, useState } from 'react'
import Container from '@/components/Container'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { EmptyState, Loading, Pagination } from '@/components/ui'
import BookCard from '@/components/BookCard'
import Seo from '@/components/Seo'
import type { Book } from '@/lib/types'

interface FavItem {
  book: Book
  reacted_at: string
}

export default function Favorites() {
  const user = useRequireAuth()
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: FavItem[]; total: number; page: number; page_size: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    api<{ items: FavItem[]; total: number; page: number; page_size: number }>(`/users/me/reactions`, { params: { type: 'favorite', page, page_size: 9 } })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: 9 }))
      .finally(() => setLoading(false))
  }, [user, page])

  if (!user) return <Loading className="min-h-[60vh]" label="正在验证登录状态…" />

  return (
    <>
      <Seo siteName={siteName} title="我的收藏" noindex />
      <Container>
        <div className="pb-6">
          <h1 className="text-2xl font-bold text-ink">我的收藏</h1>
          <p className="mt-1 text-sm text-slate-500">你收藏的全部书籍</p>
        </div>

        {loading || data === null ? (
          <Loading label="正在加载收藏书籍…" />
        ) : data.total === 0 ? (
          <EmptyState>还没有收藏书籍，去书籍详情页收藏喜欢的作品吧</EmptyState>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map(({ book }) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </>
        )}
      </Container>
    </>
  )
}
