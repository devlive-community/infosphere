import Link from 'next/link'
import type { Tag } from '@/lib/types'

// TagChips 书卡与详情页的标签 chip（对齐首页设计基线的分类标签）
export default function TagChips({ tags, max = 3, link = true }: { tags?: Tag[]; max?: number; link?: boolean }) {
  if (!tags || tags.length === 0) return null
  const shown = tags.slice(0, max)
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((tag) => {
        const cls = 'inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200 transition-colors hover:bg-primary-100'
        return link ? (
          <Link key={tag.id} href={`/explore?tag=${encodeURIComponent(tag.slug)}`} className={cls} onClick={(e) => e.stopPropagation()}>
            {tag.name}
          </Link>
        ) : (
          <span key={tag.id} className={cls}>{tag.name}</span>
        )
      })}
      {tags.length > shown.length && <span className="text-xs text-slate-400">+{tags.length - shown.length}</span>}
    </span>
  )
}
