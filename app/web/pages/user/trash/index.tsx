import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Container from '@/components/Container'
import Seo from '@/components/Seo'
import { api, formatDate } from '@/lib/api'
import { useApp, useRequireAuth } from '@/lib/auth'
import type { PageResult, TrashItem } from '@/lib/types'
import { Badge, Button, Card, EmptyState, Loading, Pagination, useFeedback } from '@/components/ui'

type TrashType = 'book' | 'document'

function remainingDays(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
}

export default function TrashPage() {
  const user = useRequireAuth()
  const { site } = useApp()
  const { showToast, confirmAction } = useFeedback()
  const [type, setType] = useState<TrashType>('book')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PageResult<TrashItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const siteName = site.site_name || 'InfoSphere'

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const result = await api<PageResult<TrashItem>>('/trash', { params: { type, page, page_size: 10 } })
      setData({ ...result, items: result.items || [] })
    } catch (error) {
      setData({ items: [], total: 0, page: 1, page_size: 10 })
      showToast({ title: '加载失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }, [page, showToast, type, user])

  useEffect(() => { load() }, [load])

  function switchType(next: TrashType) {
    if (next === type) return
    setType(next)
    setPage(1)
    setData(null)
  }

  async function restore(item: TrashItem) {
    const key = `restore-${item.type}-${item.id}`
    setBusy(key)
    try {
      await api(`/trash/${item.type === 'book' ? 'books' : 'documents'}/${item.id}/restore`, { method: 'POST' })
      showToast({ title: '恢复成功', message: item.type === 'book' ? `《${item.title}》及其章节已恢复` : `章节「${item.title}」已恢复`, tone: 'success' })
      await load()
    } catch (error) {
      showToast({ title: '恢复失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function removePermanently(item: TrashItem) {
    const label = item.type === 'book' ? `《${item.title}》及其全部内容` : `章节「${item.title}」及其子章节`
    const confirmed = await confirmAction({
      title: '永久删除',
      message: `确定永久删除${label}吗？此操作无法撤销。`,
      confirmLabel: '永久删除',
      danger: true,
    })
    if (!confirmed) return
    const key = `delete-${item.type}-${item.id}`
    setBusy(key)
    try {
      await api(`/trash/${item.type === 'book' ? 'books' : 'documents'}/${item.id}`, { method: 'DELETE' })
      showToast({ title: '已永久删除', message: `${item.title}已从回收站移除`, tone: 'success' })
      if (data && data.items.length === 1 && page > 1) setPage(page - 1)
      else await load()
    } catch (error) {
      showToast({ title: '永久删除失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (!user) return <Loading className="min-h-[60vh]" label="正在验证登录状态…" />

  return (
    <>
      <Seo siteName={siteName} title="回收站" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 pb-4 text-sm text-slate-500">
          <Link href="/books" className="hover:text-primary-600">我的书籍</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">回收站</span>
        </nav>

        <div className="flex flex-col justify-between gap-4 pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold text-ink">回收站</h1>
            <p className="mt-2 text-[15px] text-slate-500">删除的内容会保留 30 天，到期后自动永久清理。</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <i className="fa-solid fa-rotate" aria-hidden="true" /> 刷新
          </Button>
        </div>

        <div className="mb-5 flex gap-2 border-b border-slate-200" role="tablist" aria-label="回收站内容类型">
          <Button type="button" role="tab" variant="ghost" aria-selected={type === 'book'} onClick={() => switchType('book')}
            className={`min-h-10 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${type === 'book' ? 'border-primary-500 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <i className="fa-solid fa-book mr-2" aria-hidden="true" />书籍
          </Button>
          <Button type="button" role="tab" variant="ghost" aria-selected={type === 'document'} onClick={() => switchType('document')}
            className={`min-h-10 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${type === 'document' ? 'border-primary-500 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <i className="fa-regular fa-file-lines mr-2" aria-hidden="true" />章节
          </Button>
        </div>

        {loading || data === null ? (
          <Loading className="py-20" label="正在加载回收站…" />
        ) : data.items.length === 0 ? (
          <EmptyState>
            <i className="fa-regular fa-trash-can mb-3 block text-2xl text-slate-300" aria-hidden="true" />
            回收站中没有{type === 'book' ? '书籍' : '章节'}
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => {
              const days = remainingDays(item.expires_at)
              const restoreKey = `restore-${item.type}-${item.id}`
              const deleteKey = `delete-${item.type}-${item.id}`
              return (
                <Card key={`${item.type}-${item.id}`} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <i className={`fa-solid ${item.type === 'book' ? 'fa-book' : 'fa-file-lines'}`} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-slate-900">{item.title}</h2>
                        <Badge tone={days <= 3 ? 'rose' : days <= 7 ? 'amber' : 'slate'}>剩余 {days} 天</Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {item.book_title && <span>所属书籍：{item.book_title}</span>}
                        <span>{item.type === 'book' ? `${item.descendant_count} 个章节` : `${item.descendant_count} 个子章节`}</span>
                        <span>删除于 {formatDate(item.deleted_at)}</span>
                        {user.role === 'admin' && item.owner_username && <span>所有者：{item.owner_username}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 sm:justify-end">
                      <Button variant="outline" loading={busy === restoreKey} disabled={busy !== null} onClick={() => restore(item)}>
                        <i className="fa-solid fa-rotate-left" aria-hidden="true" /> 恢复
                      </Button>
                      <Button variant="danger" loading={busy === deleteKey} disabled={busy !== null} onClick={() => removePermanently(item)}>
                        <i className="fa-solid fa-trash" aria-hidden="true" /> 永久删除
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </div>
        )}
      </Container>
    </>
  )
}
