import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Badge, EmptyState, Loading, Modal, Pagination } from '@/components/ui'
import BookCard from '@/components/BookCard'
import type { Book, PageResult } from '@/lib/types'

const PAGE_SIZE = 6

// BookVersionsModal 「版本聚合」列表中点开某本书的全部版本：服务端按站点版本排序配置排序并分页。
export default function BookVersionsModal({ book, open, onClose }: { book: Book; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<Book> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) setPage(1) }, [open, book.id])

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError('')
    api<PageResult<Book>>(`/books/${book.id}/versions/books`, { params: { page, page_size: PAGE_SIZE } })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError((e as Error).message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, book.id, page]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={onClose} title={t('book.variant.listTitle', { title: book.title })} className="max-w-2xl">
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <EmptyState>{t('book.variant.listFailed')}：{error}</EmptyState>
      ) : !data || data.items.length === 0 ? (
        <EmptyState>{t('book.variant.listEmpty')}</EmptyState>
      ) : (
        <div className={`space-y-3 ${loading ? 'pointer-events-none opacity-60' : ''}`} aria-busy={loading}>
          {data.items.map((b) => (
            <BookCard key={b.id} book={b} view="list" showDescription={false} tagsMax={0}
              badge={b.version ? <Badge tone="primary">{t('book.variant.version')} {b.version}</Badge> : undefined} />
          ))}
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} size="sm" />
        </div>
      )}
    </Modal>
  )
}
