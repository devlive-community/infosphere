import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, EmptyState, Loading, Pagination } from '@/components/ui'
import { BellIcon, FileTextIcon, HeartIcon, UsersIcon, InfoCircleIcon } from '@/components/icons'
import Seo from '@/components/Seo'

interface NotificationItem {
  id: number
  type: string
  title: string
  payload: { link?: string }
  read_at: string | null
  created_at: string
}

const PER_PAGE = 20

// typeIcon 通知类型图标（comment/reaction/collaboration/system）
function typeIcon(type: string) {
  const cls = 'h-4.5 w-4.5'
  switch (type) {
    case 'comment': return <FileTextIcon className={cls} />
    case 'reaction': return <HeartIcon className={cls} />
    case 'collaboration': return <UsersIcon className={cls} />
    case 'system': return <InfoCircleIcon className={cls} />
    default: return <BellIcon className={cls} />
  }
}

// 通知中心：完整的通知列表（分页 + 未读筛选），铃铛下拉只展示最近 10 条
export default function NotificationsPage() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const data = await api<{ notifications: NotificationItem[]; total: number; unread_count: number }>(
        '/notifications',
        { params: { page, per_page: PER_PAGE, unread: tab === 'unread' ? 'true' : undefined } },
      )
      setItems(data.notifications || [])
      setTotal(data.total || 0)
      setUnread(data.unread_count || 0)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [user, page, tab])

  useEffect(() => { load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page, tab])

  if (!user) return null

  async function markRead(ids: number[]) {
    try {
      const data = await api<{ unread_count: number }>('/notifications/read', { method: 'POST', body: { ids } })
      setUnread(data.unread_count || 0)
      setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)))
    } catch { /* 保持原状 */ }
  }

  async function markAllRead() {
    try {
      const data = await api<{ unread_count: number }>('/notifications/read', { method: 'POST', body: { all: true } })
      setUnread(0)
      setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
      if (tab === 'unread') load()
      void data
    } catch { /* 保持原状 */ }
  }

  async function openItem(n: NotificationItem) {
    if (!n.read_at) await markRead([n.id])
    if (n.payload?.link) router.push(n.payload.link)
  }

  return (
    <>
      <Seo siteName={siteName} title="通知中心" noindex />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-ink">通知中心</h1>
          <div className="flex items-center gap-2">
            {(['all', 'unread'] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setPage(1) }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t ? 'bg-primary-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}>
                {t === 'all' ? '全部' : `未读${unread > 0 ? `（${unread}）` : ''}`}
              </button>
            ))}
            {unread > 0 && <Button variant="outline" size="sm" onClick={markAllRead}>全部已读</Button>}
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <Loading className="py-16" />
          ) : error ? (
            <p className="py-16 text-center text-sm text-rose-500">{error}</p>
          ) : items.length === 0 ? (
            <EmptyState>
              <BellIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              {tab === 'unread' ? '没有未读通知' : '暂无通知'}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      n.read_at ? 'bg-slate-100 text-slate-400' : 'bg-primary-50 text-primary-600'
                    }`}>
                      {typeIcon(n.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-6 ${n.read_at ? 'text-slate-500' : 'font-medium text-slate-900'}`}>
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">{formatDate(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && !error && items.length > 0 && (
          <div className="mt-6">
            <Pagination page={page} pageSize={PER_PAGE} total={total} onChange={setPage} />
          </div>
        )}
      </div>
    </>
  )
}
