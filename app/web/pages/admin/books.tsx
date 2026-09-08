import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import UserAvatar from '@/components/UserAvatar'
import { api, formatDate, formatNumber } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { resolveMediaUrl } from '@/lib/media'
import { Badge, DropdownMenu, EmptyState, Input, Loading, Pagination, Select, useFeedback } from '@/components/ui'
import { EyeIcon, FileTextIcon, GearIcon, SearchIcon, TrashIcon } from '@/components/icons'
import type { Book, BookStatus, PageResult } from '@/lib/types'

const PAGE_SIZE = 15

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
]

const visibilityOptions = [
  { value: '', label: '全部可见性' },
  { value: 'public', label: '公开' },
  { value: 'private', label: '私有' },
]

const sortOptions = [
  { value: 'created_at_desc', label: '最新创建' },
  { value: 'created_at_asc', label: '最早创建' },
  { value: 'updated_at_desc', label: '最近更新' },
  { value: 'updated_at_asc', label: '最久未更新' },
  { value: 'view_count_desc', label: '浏览量从高到低' },
  { value: 'view_count_asc', label: '浏览量从低到高' },
]

const rowStatusOptions = statusOptions.filter((option) => option.value)
const rowVisibilityOptions = visibilityOptions.filter((option) => option.value)

function statusLabel(status: BookStatus): string {
  return status === 'published' ? '已发布' : status === 'archived' ? '已归档' : '草稿'
}

function statusTone(status: BookStatus): 'emerald' | 'slate' | 'amber' {
  return status === 'published' ? 'emerald' : status === 'archived' ? 'slate' : 'amber'
}

// 书籍管理：管理员检索全站书籍并调整状态、可见性或删除书籍。
export default function AdminBooks() {
  const { user } = useApp()
  const { confirmAction } = useFeedback()
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState<Book[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [visibility, setVisibility] = useState('')
  const [sort, setSort] = useState('created_at_desc')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setNotice(null)
    try {
      const result = await api<PageResult<Book>>('/admin/books', {
        params: { page, page_size: PAGE_SIZE, q, status, visibility, sort },
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true })
    } finally {
      setLoading(false)
    }
  }, [page, q, sort, status, visibility])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  async function updateBook(book: Book, changes: Partial<Pick<Book, 'status' | 'is_public'>>) {
    setBusyId(book.id)
    setNotice(null)
    try {
      const updated = await api<Book>(`/books/${book.id}`, { method: 'PUT', body: changes })
      setItems((current) => current.map((item) => item.id === book.id
        ? { ...item, ...updated, chapter_count: item.chapter_count, tags: item.tags, user: item.user }
        : item))
      setNotice({ message: `已更新《${book.title}》` })
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true })
    } finally {
      setBusyId(null)
    }
  }

  async function removeBook(book: Book) {
    if (!await confirmAction({
      title: '删除书籍',
      message: `确定删除《${book.title}》及其全部章节吗？此操作不可恢复。`,
      confirmLabel: '删除书籍',
      danger: true,
    })) return

    setBusyId(book.id)
    setMenuFor(null)
    setNotice(null)
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' })
      if (items.length === 1 && page > 1) setPage((current) => current - 1)
      else load()
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminLayout current="books" breadcrumb="书籍管理">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">书籍管理</h1>
        <p className="mt-1.5 text-sm text-slate-500">查看全站公开与私有书籍，管理发布状态、可见性以及异常内容。</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={(event) => { event.preventDefault(); setPage(1); load() }} className="w-full max-w-xs">
          <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }}
            leading={<SearchIcon className="h-4 w-4" />} placeholder="搜索书名、slug 或作者" />
        </form>
        <Select className="w-36" value={status} options={statusOptions}
          onChange={(value) => { setStatus(value); setPage(1) }} />
        <Select className="w-36" value={visibility} options={visibilityOptions}
          onChange={(value) => { setVisibility(value); setPage(1) }} />
        <Select className="w-48" value={sort} options={sortOptions}
          onChange={(value) => { setSort(value); setPage(1) }} />
        <span className="ml-auto text-sm text-slate-400">共 {total} 本书籍</span>
      </div>

      {notice && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${notice.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {notice.message}
        </div>
      )}

      {loading ? (
        <Loading className="py-24" label="正在加载书籍…" />
      ) : items.length === 0 ? (
        <EmptyState>没有符合条件的书籍</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                    <th className="px-5 py-3">书籍</th>
                    <th className="px-5 py-3">作者</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">可见性</th>
                    <th className="px-5 py-3">数据</th>
                    <th className="px-5 py-3">更新时间</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((book) => (
                    <tr key={book.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-primary-300 to-[#8B8DFF] text-sm font-bold text-white">
                            {book.cover_image
                              ? <img src={resolveMediaUrl(book.cover_image)} alt="" className="h-full w-full object-cover" />
                              : book.title.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/book/detail/${encodeURIComponent(book.slug)}`}
                              className="block max-w-xs truncate font-medium text-slate-800 hover:text-primary-600">
                              {book.title}
                            </Link>
                            <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">/{book.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {book.user ? (
                          <div className="flex items-center gap-2">
                            <UserAvatar user={book.user} size="h-7 w-7" tooltip={false} />
                            <Link href={`/user/${encodeURIComponent(book.user.username)}`} className="text-slate-600 hover:text-primary-600">
                              {book.user.username}
                            </Link>
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Badge tone={statusTone(book.status)}>{statusLabel(book.status)}</Badge>
                          <Select className="w-28" value={book.status} disabled={busyId === book.id}
                            options={rowStatusOptions}
                            onChange={(value) => updateBook(book, { status: value as BookStatus })} />
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Select className="w-28" value={book.is_public ? 'public' : 'private'} disabled={busyId === book.id}
                          options={rowVisibilityOptions}
                          onChange={(value) => updateBook(book, { is_public: value === 'public' })} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        <p>{book.chapter_count || 0} 个章节</p>
                        <p className="mt-1">{formatNumber(book.view_count)} 次浏览</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(book.updated_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <DropdownMenu open={menuFor === book.id}
                          onOpenChange={(open) => setMenuFor(open ? book.id : null)} label="书籍操作">
                          <Link role="menuitem" href={`/book/detail/${encodeURIComponent(book.slug)}`}
                            onClick={() => setMenuFor(null)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                            <EyeIcon className="h-4 w-4 text-slate-400" /> 查看详情
                          </Link>
                          <Link role="menuitem" href={`/book/settings/${encodeURIComponent(book.slug)}`}
                            onClick={() => setMenuFor(null)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                            <GearIcon className="h-4 w-4 text-slate-400" /> 书籍设置
                          </Link>
                          <Link role="menuitem" href={`/admin/documents?book_id=${book.id}`}
                            onClick={() => setMenuFor(null)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                            <FileTextIcon className="h-4 w-4 text-slate-400" /> 管理章节
                          </Link>
                          <div className="my-1 border-t border-slate-100" />
                          <button role="menuitem" disabled={busyId === book.id} onClick={() => removeBook(book)}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                            <TrashIcon className="h-4 w-4" /> 删除书籍
                          </button>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </AdminLayout>
  )
}
