import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { ButtonLink, Badge, EmptyState, Pagination } from '@/components/ui'
import { StatusBadge } from '@/components/BookCard'
import type { Book, PageResult } from '@/lib/types'

interface Summary {
  total_books: number
  total_views: number
  published: { count: number; views: number }
  draft: { count: number; views: number }
  archived: { count: number; views: number }
}

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
  const [summary, setSummary] = useState<Summary | null>(null)

  async function load() {
    if (!user) return
    try {
      setData(await api<PageResult<Book>>('/books', { params: { mine: 'true', page, page_size: 10, status } }))
      setSummary(await api<Summary>('/books/summary'))
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

  const statCards = summary && [
    { label: '全部书籍', value: summary.total_books },
    { label: '已发布', value: summary.published.count },
    { label: '草稿', value: summary.draft.count },
    { label: '总浏览', value: summary.total_views },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">我的书籍</h1>
        <ButtonLink href="/books/create">+ 新建书籍</ButtonLink>
      </div>

      {statCards && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {statCards.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {statusTabs.map((t) => (
          <button key={t.key} onClick={() => { setStatus(t.key); setPage(1) }}
            className={`btn px-3 py-1.5 text-sm ${status === t.key ? 'bg-primary-500 text-white' : 'border border-slate-300 bg-white'}`}>{t.label}</button>
        ))}
      </div>

      {data.items.length === 0 ? (
        <EmptyState>
          还没有书籍，<Link href="/books/create" className="text-primary-600 hover:underline">创建第一本</Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {data.items.map((book) => (
            <div key={book.id} className="card flex items-center gap-4 p-4">
              <div className="h-16 w-12 shrink-0 rounded bg-gradient-to-br from-primary-500/80 to-violet-500/80">
                {book.cover_image && <img src={book.cover_image} alt="" className="h-full w-full rounded object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/book/detail?slug=${encodeURIComponent(book.slug)}`} className="truncate font-semibold text-slate-900 hover:text-primary-600">{book.title}</Link>
                  <StatusBadge status={book.status} />
                  {book.is_public && <Badge tone="sky">公开</Badge>}
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-500">{book.description || '暂无简介'}</p>
                <p className="mt-0.5 text-xs text-slate-400">/ {book.slug} · 👁 {book.view_count}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ButtonLink href={`/book/detail?slug=${encodeURIComponent(book.slug)}`} variant="outline" className="px-3 py-1.5 text-sm">章节</ButtonLink>
                <ButtonLink href={`/books/edit?slug=${encodeURIComponent(book.slug)}`} variant="outline" className="px-3 py-1.5 text-sm">设置</ButtonLink>
                <button onClick={() => remove(book)} className="btn-outline px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
    </div>
  )
}
