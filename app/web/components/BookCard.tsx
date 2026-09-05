import Link from 'next/link'
import { API_BASE, formatNumber, formatDate } from '@/lib/api'
import type { Book } from '@/lib/types'

const statusNames: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' }
const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-emerald-50 text-emerald-600',
  archived: 'bg-amber-50 text-amber-600',
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusStyles[status] || statusStyles.draft}`}>{statusNames[status] || status}</span>
}

export default function BookCard({ book, href }: { book: Book; href?: string }) {
  const link = href || `/book/detail?slug=${encodeURIComponent(book.slug)}`
  const cover = book.cover_image
    ? API_BASE + book.cover_image
    : ''
  return (
    <Link href={link} className="card group flex flex-col overflow-hidden transition hover:shadow-md">
      <div className="h-36 w-full bg-gradient-to-br from-primary-500/80 to-violet-500/80">
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-slate-900 group-hover:text-primary-600">{book.title}</h3>
          <StatusBadge status={book.status} />
        </div>
        <p className="line-clamp-2 min-h-[40px] text-sm text-slate-500">{book.description || '暂无简介'}</p>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-slate-400">
          <span>{book.user?.username || '佚名'}</span>
          <span className="flex gap-3">
            <span>👁 {formatNumber(book.view_count)}</span>
            <span>{formatDate(book.created_at).slice(0, 10)}</span>
          </span>
        </div>
      </div>
    </Link>
  )
}

export function Pagination({ page, pageSize, total, onChange }: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const list: number[] = []
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) list.push(i)
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn-outline px-3 py-1.5">上一页</button>
      {list[0] > 1 && <span className="px-1 text-slate-400">…</span>}
      {list.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`btn px-3 py-1.5 ${p === page ? 'bg-primary-500 text-white' : 'border border-slate-300 bg-white hover:bg-slate-100'}`}>{p}</button>
      ))}
      {list[list.length - 1] < pages && <span className="px-1 text-slate-400">…</span>}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="btn-outline px-3 py-1.5">下一页</button>
    </div>
  )
}
