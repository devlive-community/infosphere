import Link from 'next/link'
import { resolveMediaUrl } from '@/lib/media'
import { formatNumber } from '@/lib/api'
import TagChips from '@/components/TagChips'
import UserAvatar from '@/components/UserAvatar'
import { ArrowRightIcon, EyeIcon, CalendarIcon } from '@/components/icons'
import type { Book } from '@/lib/types'

interface ExploreBookCardProps {
  book: Book
  /** 网格（宽图）或列表（行卡） */
  view?: 'grid' | 'list'
  /** 是否显示作者条（自己的书籍页可关） */
  showAuthor?: boolean
  /** tag 是否可点（外层已是链接时传 false） */
  linkTags?: boolean
  /** 覆盖封面点击目标（默认书籍详情） */
  href?: string
}

// ExploreBookCard 通用书籍发现卡：宽图/行卡两种视图。
// 交互约定：封面与标题点击进书籍详情；作者头像/名字点击进用户主页；标签点击进入该标签的发现过滤。
// 卡片根节点是 div（内部含多个链接，避免嵌套 <a> 破坏水合）。
export default function ExploreBookCard({ book, view = 'grid', showAuthor = true, linkTags = true, href }: ExploreBookCardProps) {
  const cover = resolveMediaUrl(book.cover_image)
  const detailHref = href || `/book/detail/${encodeURIComponent(book.slug)}`
  const date = book.updated_at?.slice(0, 10) || book.created_at?.slice(0, 10)
  const showArrow = !!cover

  const coverBlock = (
    <Link href={detailHref} aria-label={book.title}
      className="relative block aspect-[16/8] w-full overflow-hidden bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
      {cover
        ? <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        : <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-white/80">{book.title.slice(0, 1)}</span>}
      {showArrow && (
        <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 opacity-0 shadow transition-opacity duration-200 group-hover:opacity-100">
          <ArrowRightIcon className="h-4 w-4" />
        </span>
      )}
    </Link>
  )

  const tagBlock = linkTags
    ? <TagChips tags={book.tags} max={1} />
    : <TagChips tags={book.tags} max={1} link={false} />

  const titleBlock = (
    <Link href={detailHref} className="mt-2 block min-w-0 truncate font-semibold text-slate-900 hover:text-primary-600">
      {book.title}
    </Link>
  )

  const authorBlock = showAuthor && book.user && (
    <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
      <UserAvatar user={book.user} size="h-5 w-5" />
      <span className="truncate text-xs text-slate-500">{book.user.username}</span>
    </div>
  )

  const metaBlock = (
    <div className="flex items-center gap-4 text-xs text-slate-400">
      <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>
      <span className="flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> {date}</span>
    </div>
  )

  if (view === 'list') {
    return (
      <div className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
        <Link href={detailHref} aria-label={book.title}
          className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
          {cover
            ? <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            : <span className="flex h-full w-full items-center justify-center text-xl font-bold text-white/80">{book.title.slice(0, 1)}</span>}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {titleBlock}
            {tagBlock}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">{book.description || '暂无简介'}</p>
          <div className="mt-1 flex items-center gap-4 text-xs text-slate-400">{metaBlock}</div>
        </div>
        {showAuthor && book.user && (
          <span className="flex shrink-0 items-center gap-2 text-sm text-slate-400">
            <UserAvatar user={book.user} size="h-6 w-6" />
            {book.user.username}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {coverBlock}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          {tagBlock}
          {showAuthor && book.user && (
            <Link href={`/user/${encodeURIComponent(book.user.username)}`}
              className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-primary-600">
              <UserAvatar user={book.user} size="h-5 w-5" />
              {book.user.username}
            </Link>
          )}
        </div>
        {titleBlock}
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{book.description || '暂无简介'}</p>
        <div className="mt-auto pt-3">{metaBlock}</div>
      </div>
    </div>
  )
}
