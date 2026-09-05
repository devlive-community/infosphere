import { useEffect, useState } from 'react'
import Container from '@/components/Container'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { ButtonLink, Badge, EmptyState, Pagination } from '@/components/ui'
import { StatusBadge } from '@/components/BookCard'
import { EyeIcon } from '@/components/icons'
import TagChips from '@/components/TagChips'
import type { Book, PageResult } from '@/lib/types'

const statusTabs = [
  { key: '', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'draft', label: '草稿' },
  { key: 'archived', label: '已归档' },
]

export default function MyBooks() {
  const user = useRequireAuth()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<Book>>({ items: [], total: 0, page: 1, page_size: 10 })

  async function load() {
    if (!user) return
    try {
      setData(await api<PageResult<Book>>('/books', { params: { mine: 'true', page, page_size: 10, status } }))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  useEffect(() => { if (user) load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [user, page, status])

  async function remove(book: Book) {
    if (!confirm(`确定删除「${book.title}」及其全部章节吗？此操作不可恢复。`)) return
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (!user) return null

  return (
    <Container>
      <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">我的书籍</h1>
        <ButtonLink href="/books/create">+ 新建书籍</ButtonLink>
      </div>

      <div className="mb-4 flex gap-2">
        {statusTabs.map((t) => (
          <button key={t.key} onClick={() => { setStatus(t.key); setPage(1) }}
            className={`inline-flex h-9 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors focus:outline-none ${
              status === t.key
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}>{t.label}</button>
        ))}
      </div>

      {(data.items || []).length === 0 ? (
        <EmptyState>
          还没有书籍，<Link href="/books/create" className="text-primary-600 hover:underline">创建第一本</Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {(data.items || []).map((book) => (
            <div key={book.id} className="rounded-xl border border-slate-200 bg-white shadow-sm flex items-center gap-4 p-4">
              <div className="h-16 w-12 shrink-0 rounded bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
                {book.cover_image && <img src={book.cover_image} alt="" className="h-full w-full rounded object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/book/detail?slug=${encodeURIComponent(book.slug)}`} className="truncate font-semibold text-slate-900 hover:text-primary-600">{book.title}</Link>
                  <StatusBadge status={book.status} />
                  {book.is_public && <Badge tone="sky">公开</Badge>}
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-500">{book.description || '暂无简介'}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">/ {book.slug} · <EyeIcon className="h-3.5 w-3.5" /> {book.view_count}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ButtonLink href={`/book/detail?slug=${encodeURIComponent(book.slug)}`} variant="outline" size="sm">章节</ButtonLink>
                <ButtonLink href={`/books/edit?slug=${encodeURIComponent(book.slug)}`} variant="outline" size="sm">设置</ButtonLink>
                <button onClick={() => remove(book)} className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 focus:outline-none">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
    </div>
    </Container>
  )
}
