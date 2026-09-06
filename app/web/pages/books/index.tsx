import { useEffect, useState , Fragment } from 'react'
import Seo from '@/components/Seo'
import Container from '@/components/Container'
import Link from 'next/link'
import { api, formatDate, formatNumber } from '@/lib/api'
import { useRequireAuth , useApp} from '@/lib/auth'
import { ButtonLink, Badge, EmptyState, Pagination, Select, Loading , Tooltip} from '@/components/ui'
import { StatusBadge } from '@/components/BookCard'
import TagChips from '@/components/TagChips'
import {
  BookIcon, CalendarIcon, EyeIcon, FileTextIcon, GearIcon, GridIcon,
  ListIcon, MoreIcon, PencilIcon, SearchIcon,
} from '@/components/icons'
import type { Book, Document, PageResult } from '@/lib/types'

const statusTabs = [
  { key: '', label: '全部' },
  { key: 'published', label: '已发布' },
  { key: 'draft', label: '草稿' },
  { key: 'archived', label: '已归档' },
]

type SortKey = 'updated' | 'created' | 'views' | 'title'

const sortOptions = [
  { value: 'updated', label: '最近更新' },
  { value: 'created', label: '创建时间' },
  { value: 'views', label: '浏览最多' },
  { value: 'title', label: '标题排序' },
]

function relativeUpdated(input: string | null | undefined): string {
  if (!input) return '-'
  const diff = Date.now() - new Date(input).getTime()
  const day = 86400000
  if (diff < 3600000) return '刚刚更新'
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前更新`
  if (diff < day * 2) return '1 天前更新'
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前更新`
  return `${fmtDay(input)} 更新`
}

function fmtDay(input: string | null | undefined): string {
  return input ? input.slice(0, 10) : '-'
}

function chapterCount(book: Book): number {
  return (book.tags?.length ?? 0) + 0 || 0
}

export default function MyBooks() {
  const user = useRequireAuth()
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [data, setData] = useState<PageResult<Book>>({ items: [], total: 0, page: 1, page_size: 10 })
  const [counts, setCounts] = useState<Record<string, number>>({ '': 0, published: 0, draft: 0, archived: 0 })
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      setData(await api<PageResult<Book>>('/books', { params: { mine: 'true', page, page_size: 9, status, title: keyword } }))
      const summary = await api<Record<string, number>>('/books/status-counts').catch(() => null)
      if (summary) setCounts(summary)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (user) load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [user, page, status, keyword])

  // 客户端排序（API 分页内排序字段当前仅支持基础列；数量小时在当前页排序即可）
  const items = [...(data.items || [])].sort((a, b) => {
    if (sort === 'views') return b.view_count - a.view_count
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN')
    if (sort === 'created') return a.created_at < b.created_at ? 1 : -1
    return a.updated_at < b.updated_at ? 1 : -1
  })

  async function remove(book: Book) {
    if (!confirm(`确定删除「${book.title}」及其全部章节吗？此操作不可恢复。`)) return
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function copyLink(book: Book) {
    const url = `${window.location.origin}/book/detail/${encodeURIComponent(book.slug)}`
    try {
      await navigator.clipboard.writeText(url)
      alert('访问链接已复制')
    } catch {
      window.prompt('复制访问链接', url)
    }
    setMenuFor(null)
  }

  if (!user) return null

  const hasBooks = (data.items || []).length > 0

  return (
    <>
      <Seo siteName={siteName} title="我的书籍" noindex />
      <Container>
      {/* 页头 */}
      <div className="pb-8 pt-2">
        <p className="text-sm text-slate-400">个人知识库</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink md:text-4xl">我的书籍</h1>
            <p className="mt-2 text-[15px] text-slate-500">在这里继续写作、整理章节，或者发布你的下一本知识作品。</p>
          </div>
          <ButtonLink href="/books/create" className="h-11 px-5 text-base">
            <PlusIcon className="h-5 w-5" /> 新建书籍
          </ButtonLink>
        </div>
      </div>

      {/* 筛选行 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-200 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {statusTabs.map((t) => (
            <button key={t.key} onClick={() => { setStatus(t.key); setPage(1) }}
              className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                status === t.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              {t.label} {counts[t.key] !== undefined && <span className="ml-0.5">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
              placeholder="搜索我的书籍"
              className="h-10 w-56 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-primary-500 focus:outline-none" />
          </div>
          <Select className="w-36" value={sort} onChange={(v) => setSort(v as SortKey)} options={sortOptions} />
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            <button onClick={() => setView('grid')} aria-label="网格视图"
              className={`flex h-10 w-10 items-center justify-center transition-colors ${view === 'grid' ? 'bg-primary-50 text-primary-600' : 'bg-white text-slate-400 hover:text-slate-700'}`}>
              <GridIcon className="h-4 w-4" />
            </button>
            <button onClick={() => setView('list')} aria-label="列表视图"
              className={`flex h-10 w-10 items-center justify-center border-l border-slate-200 transition-colors ${view === 'list' ? 'bg-primary-50 text-primary-600' : 'bg-white text-slate-400 hover:text-slate-700'}`}>
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <p className="py-4 text-sm text-slate-400">共 {data.total} 本书籍</p>

      {loading ? (
        <Loading />
      ) : hasBooks ? (
        <div className={view === 'grid' ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
          {items.map((book) => (
            <BookCardMine key={book.id} book={book} view={view}
              menuOpen={menuFor === book.id} setMenuOpen={(open) => setMenuFor(open ? book.id : null)}
              onCopy={() => copyLink(book)} onDelete={() => remove(book)} />
          ))}
        </div>
      ) : (
        <EmptyState>
          还没有书籍，<Link href="/books/create" className="text-primary-600 hover:underline">创建第一本</Link>
        </EmptyState>
      )}

      <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />

    </Container>
  </>
  )
}

/* ── 单本书卡片（网格 / 列表两种视图） ── */

function BookCardMine({ book, view, menuOpen, setMenuOpen, onCopy, onDelete }: {
  book: Book
  view: 'grid' | 'list'
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  onCopy: () => void
  onDelete: () => void
}) {
  const detailUrl = `/book/detail/${encodeURIComponent(book.slug)}`
  const cover = book.cover_image
  const visibility = book.is_public
    ? <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> 公开</span>
    : <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> 仅自己可见</span>

  const meta = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
      <span className="flex items-center gap-1"><FileTextIcon className="h-3.5 w-3.5" /> {(book as any).chapter_count ?? '—'} 个章节</span>
      <span className="flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> {relativeUpdated(book.updated_at)}</span>
      {view === 'list' && <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> {formatNumber(book.view_count)}</span>}
    </div>
  )

  const menu = (
    <div className="relative">
      <button aria-label="更多操作" onClick={() => setMenuOpen(!menuOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
        <MoreIcon className="h-4 w-4" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <Link href={detailUrl} onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <EyeIcon className="h-4 w-4 text-slate-400" /> 查看详情
            </Link>
            <Link href={`/book/settings/${encodeURIComponent(book.slug)}`} onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <GearIcon className="h-4 w-4 text-slate-400" /> 书籍设置
            </Link>
            <button onClick={onCopy}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
              <LinkIcon2 className="h-4 w-4 text-slate-400" /> 复制访问链接
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button onClick={() => { setMenuOpen(false); onDelete() }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50">
              <TrashIcon className="h-4 w-4" /> 删除书籍
            </button>
          </div>
        </>
      )}
    </div>
  )

  if (view === 'list') {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Link href={detailUrl} className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xl font-bold text-white/80">{book.title.slice(0, 1)}</span>}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={detailUrl} className="min-w-0 truncate font-semibold text-slate-900 hover:text-primary-600">{book.title}</Link>
            <StatusBadge status={book.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">{book.description || '还没有填写简介'}</p>
          {meta}
        </div>
        <div className="shrink-0"><ActionRow book={book} menu={menu} /></div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex gap-4">
        <Link href={detailUrl} className="h-36 w-28 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
          {cover
            ? <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            : <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/80">{book.title.slice(0, 1)}</span>}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <Link href={detailUrl} className="min-w-0 truncate font-semibold text-slate-900 hover:text-primary-600">{book.title}</Link>
            {menu}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={book.status} />
            {visibility}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-500">{book.description || '还没有填写简介'}</p>
          <div className="mt-1.5"><TagChips tags={book.tags} max={3} link={false} /></div>
          <div className="mt-auto pt-2">{meta}</div>
        </div>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3"><ActionRow book={book} menu={null} /></div>
    </div>
  )
}

function ActionRow({ book, menu }: { book: Book; menu: React.ReactNode }) {
  const isNew = !book.description
  const [chaptersOpen, setChaptersOpen] = useState(false)
  return (
    <div className="flex items-center justify-between">
      <Link href={`/book/writer/${encodeURIComponent(book.slug)}`} className="text-sm font-medium text-primary-600 hover:underline">
        {isNew ? '开始写作' : '继续写作'}
      </Link>
      <div className="relative flex items-center gap-1">
        <Tooltip content="章节列表"><button type="button" onClick={() => setChaptersOpen(!chaptersOpen)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${chaptersOpen ? 'bg-primary-50 text-primary-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
            <FileTextIcon className="h-4 w-4" />
          </button></Tooltip>
        <Tooltip content="书籍设置"><Link href={`/book/settings/${encodeURIComponent(book.slug)}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <GearIcon className="h-4 w-4" />
          </Link></Tooltip>
        {menu}
        {chaptersOpen && <ChapterPanel book={book} onClose={() => setChaptersOpen(false)} />}
      </div>
    </div>
  )
}

// ChapterPanel 书籍章节弹出列表：懒加载文档树，点击进阅读，铅笔进编辑
function ChapterPanel({ book, onClose }: { book: Book; onClose: () => void }) {
  const [docs, setDocs] = useState<Document[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<Document[]>(`/books/${book.id}/documents`)
      .then((d) => setDocs(d || []))
      .catch((e) => setError((e as Error).message))
  }, [book.id])

  const rows = flattenDocs(docs || [])
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute bottom-10 right-0 z-40 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">章节列表</span>
          <span className="text-xs text-slate-400">{docs ? `${rows.length} 个` : ''}</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {error && <p className="px-4 py-3 text-sm text-rose-500">{error}</p>}
          {!error && docs === null && <p className="px-4 py-6 text-center text-sm text-slate-400">加载中…</p>}
          {docs !== null && rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">暂无章节</p>}
          {rows.map((row) => (
            <div key={row.doc.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50">
              <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${row.doc.slug}`}
                onClick={onClose}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-700 hover:text-primary-600"
                style={{ paddingLeft: row.level * 12 }}>
                <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{book.chapter_prefix}{row.doc.title}</span>
              </Link>
              <Link href={`/book/writer/${encodeURIComponent(book.slug)}/${row.doc.slug}`} onClick={onClose}
                className="shrink-0 text-slate-300 transition-colors hover:text-primary-600">
                <PencilIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-4 py-2">
          <Link href={`/book/writer/${encodeURIComponent(book.slug)}`} onClick={onClose}
            className="text-sm font-medium text-primary-600 hover:underline">在编辑器中管理全部章节</Link>
        </div>
      </div>
    </>
  )
}

function flattenDocs(docs: Document[], level = 0): { doc: Document; level: number }[] {
  return docs.flatMap((d) => [{ doc: d, level }, ...flattenDocs(d.children || [], level + 1)])
}

function LinkIcon2({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
