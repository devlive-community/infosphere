import Link from 'next/link'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { api, formatDate, formatNumber } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Badge, Button, DropdownMenu, EmptyState, Input, Loading, Pagination, Select, useFeedback } from '@/components/ui'
import { EyeIcon, PencilIcon, SearchIcon, TrashIcon } from '@/components/icons'
import type { DocumentStatus, Document, PageResult } from '@/lib/types'

const PAGE_SIZE = 15

interface AdminDocumentItem {
  id: number
  book_id: number
  parent_id: number | null
  title: string
  slug: string
  status: DocumentStatus
  allow_comments: boolean | null
  sort_order: number
  view_count: number
  book_title: string
  book_slug: string
  parent_title: string
  author_username: string
  created_at: string
  updated_at: string
}

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
]

const rowStatusOptions = statusOptions.filter((option) => option.value)
const commentOptions = [
  { value: 'enabled', label: '允许评论' },
  { value: 'disabled', label: '关闭评论' },
]

const sortOptions = [
  { value: 'updated_at_desc', label: '最近更新' },
  { value: 'updated_at_asc', label: '最久未更新' },
  { value: 'created_at_desc', label: '最新创建' },
  { value: 'created_at_asc', label: '最早创建' },
  { value: 'view_count_desc', label: '浏览量从高到低' },
  { value: 'view_count_asc', label: '浏览量从低到高' },
]

function statusTone(status: DocumentStatus): 'emerald' | 'slate' | 'amber' {
  return status === 'published' ? 'emerald' : status === 'archived' ? 'slate' : 'amber'
}

function statusLabel(status: DocumentStatus): string {
  return status === 'published' ? '已发布' : status === 'archived' ? '已归档' : '草稿'
}

// 章节管理：管理员跨书籍检索章节并管理发布状态、评论权限与删除操作。
export default function AdminDocuments() {
  const router = useRouter()
  const { user } = useApp()
  const { confirmAction } = useFeedback()
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState<AdminDocumentItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [bookId, setBookId] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('updated_at_desc')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null)

  useEffect(() => {
    if (!router.isReady) return
    const queryBookId = router.query.book_id
    setBookId(typeof queryBookId === 'string' ? queryBookId : '')
    setPage(1)
  }, [router.isReady, router.query.book_id])

  const load = useCallback(async () => {
    setLoading(true)
    setNotice(null)
    try {
      const result = await api<PageResult<AdminDocumentItem>>('/admin/documents', {
        params: { page, page_size: PAGE_SIZE, q, book_id: bookId, status, sort },
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true })
    } finally {
      setLoading(false)
    }
  }, [bookId, page, q, sort, status])

  useEffect(() => {
    if (isAdmin && router.isReady) load()
  }, [isAdmin, load, router.isReady])

  async function updateDocument(item: AdminDocumentItem, changes: Partial<Pick<Document, 'status' | 'allow_comments'>>) {
    setBusyId(item.id)
    setNotice(null)
    try {
      const updated = await api<Document>(`/documents/${item.id}`, { method: 'PUT', body: changes })
      setItems((current) => current.map((document) => document.id === item.id
        ? { ...document, status: updated.status, allow_comments: updated.allow_comments ?? null, updated_at: updated.updated_at }
        : document))
      setNotice({ message: `已更新章节《${item.title}》` })
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true })
    } finally {
      setBusyId(null)
    }
  }

  async function removeDocument(item: AdminDocumentItem) {
    if (!await confirmAction({
      title: '移入回收站',
      message: `确定将章节《${item.title}》及其全部子章节移入回收站吗？可在 30 天内恢复。`,
      confirmLabel: '移入回收站',
      danger: true,
    })) return

    setBusyId(item.id)
    setMenuFor(null)
    setNotice(null)
    try {
      await api(`/documents/${item.id}`, { method: 'DELETE' })
      if (items.length === 1 && page > 1) setPage((current) => current - 1)
      else load()
    } catch (error) {
      setNotice({ message: (error as Error).message, error: true })
    } finally {
      setBusyId(null)
    }
  }

  function clearBookFilter() {
    setBookId('')
    setPage(1)
    router.replace('/admin/documents', undefined, { shallow: true })
  }

  return (
    <AdminLayout current="documents" breadcrumb="章节管理">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">章节管理</h1>
        <p className="mt-1.5 text-sm text-slate-500">跨书籍检查章节状态、评论设置和异常内容，不在列表接口中加载正文。</p>
      </div>

      {bookId && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          <span>当前仅显示书籍 ID：{bookId}</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearBookFilter}>查看全部章节</Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={(event) => { event.preventDefault(); setPage(1); load() }} className="w-full max-w-xs">
          <Input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }}
            leading={<SearchIcon className="h-4 w-4" />} placeholder="搜索章节、书籍或作者" />
        </form>
        <Select className="w-36" value={status} options={statusOptions}
          onChange={(value) => { setStatus(value); setPage(1) }} />
        <Select className="w-48" value={sort} options={sortOptions}
          onChange={(value) => { setSort(value); setPage(1) }} />
        <span className="ml-auto text-sm text-slate-400">共 {total} 个章节</span>
      </div>

      {notice && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${notice.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {notice.message}
        </div>
      )}

      {loading ? (
        <Loading className="py-24" label="正在加载章节…" />
      ) : items.length === 0 ? (
        <EmptyState>没有符合条件的章节</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                    <th className="px-5 py-3">章节</th>
                    <th className="px-5 py-3">所属书籍</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">评论</th>
                    <th className="px-5 py-3">浏览</th>
                    <th className="px-5 py-3">更新时间</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="min-w-0">
                          <Link href={`/book/reader/${encodeURIComponent(item.book_slug)}/${encodeURIComponent(item.slug)}`}
                            className="block max-w-xs truncate font-medium text-slate-800 hover:text-primary-600">
                            {item.title}
                          </Link>
                          <p className="mt-0.5 max-w-xs truncate text-xs text-slate-400">
                            {item.parent_title ? `位于 ${item.parent_title} · ` : ''}/{item.slug}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/book/detail/${encodeURIComponent(item.book_slug)}`}
                          className="block max-w-[220px] truncate text-slate-700 hover:text-primary-600">
                          {item.book_title}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-400">{item.author_username || '未知作者'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                          <Select className="w-28" value={item.status} disabled={busyId === item.id}
                            options={rowStatusOptions}
                            onChange={(value) => updateDocument(item, { status: value as DocumentStatus })} />
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Select className="w-28" value={item.allow_comments === false ? 'disabled' : 'enabled'}
                          disabled={busyId === item.id} options={commentOptions}
                          onChange={(value) => updateDocument(item, { allow_comments: value === 'enabled' })} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatNumber(item.view_count)} 次</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(item.updated_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <DropdownMenu open={menuFor === item.id}
                          onOpenChange={(open) => setMenuFor(open ? item.id : null)} label="章节操作">
                          <Link role="menuitem" href={`/book/reader/${encodeURIComponent(item.book_slug)}/${encodeURIComponent(item.slug)}`}
                            onClick={() => setMenuFor(null)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                            <EyeIcon className="h-4 w-4 text-slate-400" /> 阅读章节
                          </Link>
                          <Link role="menuitem" href={`/book/writer/${encodeURIComponent(item.book_slug)}/${encodeURIComponent(item.slug)}`}
                            onClick={() => setMenuFor(null)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                            <PencilIcon className="h-4 w-4 text-slate-400" /> 编辑章节
                          </Link>
                          <div className="my-1 border-t border-slate-100" />
                          <button role="menuitem" disabled={busyId === item.id} onClick={() => removeDocument(item)}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                            <TrashIcon className="h-4 w-4" /> 移入回收站
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
