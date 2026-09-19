import { useEffect, useState } from 'react'
import Container from '@/components/Container'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { useGridPageSize } from '@/lib/useGridPageSize'
import { useTranslation } from '@/lib/i18n'
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
  const { t } = useTranslation()
  const siteName = site.site_name || 'InfoSphere'
  const { ref: gridRef, pageSize } = useGridPageSize({ minItemRem: 15, rows: 3, fallback: 9 })
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: FavItem[]; total: number; page: number; page_size: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    api<{ items: FavItem[]; total: number; page: number; page_size: number }>(`/users/me/reactions`, { params: { type: 'favorite', page, page_size: pageSize } })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: pageSize }))
      .finally(() => setLoading(false))
  }, [user, page, pageSize])

  if (!user) return <Loading className="min-h-[60vh]" label={t('account.common.verifying')} />

  return (
    <>
      <Seo siteName={siteName} title={t('favorites.seoTitle')} noindex />
      <Container>
        <div className="pb-6">
          <h1 className="text-2xl font-bold text-ink">{t('favorites.heading')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('favorites.subtitle')}</p>
        </div>

        {loading || data === null ? (
          <Loading label={t('favorites.loading')} />
        ) : data.total === 0 ? (
          <EmptyState>{t('favorites.empty')}</EmptyState>
        ) : (
          <>
            <div ref={gridRef} className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
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
