import { useEffect, useState } from 'react'
import Link from 'next/link'
import Container from '@/components/Container'
import { api, formatNumber } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { EmptyState, Loading, Pagination } from '@/components/ui'
import UserAvatar from '@/components/UserAvatar'
import { CalendarIcon, EyeIcon } from '@/components/icons'
import { resolveMediaUrl } from '@/lib/media'
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

  useEffect(() => {
    if (!user) return
    api<{ items: FavItem[]; total: number; page: number; page_size: number }>(`/users/me/reactions`, { params: { type: 'favorite', page, page_size: 9 } })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: 9 }))
  }, [user, page])

  if (!user) return null

  return (
    <>
      <Seo siteName={siteName} title="我的收藏" noindex />
      <Container>
        <div className="pb-6">
          <h1 className="text-2xl font-bold text-ink">我的收藏</h1>
          <p className="mt-1 text-sm text-slate-500">你收藏的全部书籍</p>
        </div>

        {data === null ? (
          <Loading />
        ) : data.total === 0 ? (
          <EmptyState>还没有收藏书籍，去书籍详情页收藏喜欢的作品吧</EmptyState>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {data.items.map(({ book }) => (
                <Link key={book.id} href={`/book/detail/${encodeURIComponent(book.slug)}`}
                  className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="flex gap-4">
                    <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
                      {resolveMediaUrl(book.cover_image) && <img src={resolveMediaUrl(book.cover_image)} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold text-slate-900 group-hover:text-primary-600">{book.title}</span>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{book.description || '暂无简介'}</p>
                      <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </>
        )}
      </Container>
    </>
  )
}
