import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { API_BASE, api, formatDate, getToken } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button } from '@/components/ui'
import { BellIcon } from '@/components/icons'

interface NotificationItem {
  id: number
  type: string
  title: string
  payload: { link?: string }
  read_at: string | null
  created_at: string
}

// timeAgo 简易相对时间；超过 7 天回退到日期
function timeAgo(input: string): string {
  const diff = Date.now() - new Date(input).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return formatDate(input)
}

// NotificationBell 导航栏通知铃铛：未读徽标 + 下拉面板 + SSE 实时刷新
export default function NotificationBell() {
  const { user } = useApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [marking, setMarking] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 拉取未读数与最近通知
  const load = useCallback(async () => {
    try {
      const data = await api<{ notifications: NotificationItem[]; unread_count: number }>('/notifications')
      setItems(data.notifications || [])
      setUnread(data.unread_count || 0)
    } catch { /* 未登录等场景忽略 */ }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!user) return
    load()

    // SSE 实时推送（EventSource 无法带请求头，用查询参数令牌鉴权）
    const token = getToken()
    if (!token) return
    const source = new EventSource(`${API_BASE}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`)
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { unread_count?: number; notification?: NotificationItem }
        if (typeof data.unread_count === 'number') setUnread(data.unread_count)
        if (data.notification) {
          setUnread((n) => n + 1)
          setItems((list) => [data.notification as NotificationItem, ...list].slice(0, 10))
        }
      } catch { /* 忽略无法解析的帧 */ }
    }
    return () => source.close()
  }, [user, load])

  // 点击面板外部关闭
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  async function markRead(ids: number[]) {
    setMarking(true)
    try {
      const data = await api<{ unread_count: number }>('/notifications/read', { method: 'POST', body: { ids } })
      setUnread(data.unread_count || 0)
      setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)))
    } catch { /* 标记失败保持原状 */ }
    setMarking(false)
  }

  async function markAllRead() {
    setMarking(true)
    try {
      const data = await api<{ unread_count: number }>('/notifications/read', { method: 'POST', body: { all: true } })
      setUnread(data.unread_count || 0)
      setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    } catch { /* 标记失败保持原状 */ }
    setMarking(false)
  }

  async function openItem(n: NotificationItem) {
    setOpen(false)
    if (!n.read_at) markRead([n.id])
    if (n.payload?.link) router.push(n.payload.link)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button onClick={() => setOpen(!open)} aria-label="通知"
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">通知</span>
            {unread > 0 && (
              <Button variant="ghost" size="sm" loading={marking} onClick={markAllRead}>全部已读</Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!loaded ? (
              <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">暂无通知</p>
            ) : (
              items.map((n) => (
                <button key={n.id} onClick={() => openItem(n)}
                  className="flex w-full items-start gap-2.5 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-primary-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm leading-5 ${n.read_at ? 'text-slate-500' : 'font-medium text-slate-900'}`}>
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
