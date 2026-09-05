import Link from 'next/link'
import { API_BASE, formatNumber, formatDate } from '@/lib/api'
import { EyeIcon } from '@/components/icons'
import { Badge } from '@/components/ui'
import TagChips from '@/components/TagChips'
import type { Book } from '@/lib/types'

const statusNames: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' }
const statusTones: Record<string, 'slate' | 'emerald' | 'amber'> = {
  draft: 'slate',
  published: 'emerald',
  archived: 'amber',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTones[status] || 'slate'}>{statusNames[status] || status}</Badge>
}

export default function BookCard({ book, href }: { book: Book; href?: string }) {
  const link = href || `/book/detail/${encodeURIComponent(book.slug)}`
  const cover = book.cover_image ? API_BASE + book.cover_image : ''
  return (
    <Link href={link} className="rounded-xl border border-slate-200 bg-white shadow-sm group flex flex-col overflow-hidden transition hover:shadow-md">
      <div className="h-36 w-full bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
        {cover && <img src={cover} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} className="h-full w-full object-cover" />}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-slate-900 group-hover:text-primary-600">{book.title}</h3>
          <StatusBadge status={book.status} />
        </div>
        <p className="line-clamp-2 min-h-[40px] text-sm text-slate-500">{book.description || '暂无简介'}</p>
        <TagChips tags={book.tags} max={2} link={false} />
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-slate-400">
          <span>{book.user?.username || '佚名'}</span>
          <span className="flex gap-3">
            <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>
            <span>{formatDate(book.created_at).slice(0, 10)}</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
