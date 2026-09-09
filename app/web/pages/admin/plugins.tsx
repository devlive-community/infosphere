import { useCallback, useEffect, useRef, useState } from 'react'
import { api, API_BASE, getToken } from '@/lib/api'
import { useApp } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import { Badge, Button, Loading, useFeedback } from '@/components/ui'

interface Plugin {
  key: string
  name: string
  description: string
  size_hint: string
  installed: boolean
  version: string
  status?: string
  error?: string
}

interface LogLine { time: string; level: string; text: string }

// 管理控制台 · 插件：安装/卸载后台功能插件（如 PDF 导出），实时日志经 SSE 推送
export default function AdminPlugins() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { showToast, confirmAction } = useFeedback()
  const [items, setItems] = useState<Plugin[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [logOpen, setLogOpen] = useState<Record<string, boolean>>({})
  const sources = useRef<Record<string, EventSource>>({})

  const load = useCallback(() => {
    api<{ items: Plugin[] }>('/admin/plugins').then((r) => setItems(r.items)).catch(() => {})
  }, [])
  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  // 下载中时轮询状态（安装完成后停止）
  useEffect(() => {
    if (!items?.some((p) => p.status === 'downloading')) return
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [items, load])

  // 打开某插件的日志 SSE 流；重复调用先关闭旧连接
  const openLogs = useCallback((key: string) => {
    sources.current[key]?.close()
    setLogOpen((s) => ({ ...s, [key]: true }))
    const token = getToken()
    const es = new EventSource(`${API_BASE}/api/v1/admin/plugins/${key}/logs?token=${encodeURIComponent(token || '')}`)
    es.onmessage = (e) => {
      try {
        const line = JSON.parse(e.data) as LogLine
        setLogs((s) => ({ ...s, [key]: [...(s[key] || []), line].slice(-200) }))
        if (line.level === 'success' || line.level === 'error') load()
      } catch { /* 忽略心跳等非 JSON 行 */ }
    }
    es.onerror = () => { /* 浏览器会自动重连；出错时不打断 */ }
    sources.current[key] = es
  }, [load])

  // 卸载时关闭全部日志连接
  useEffect(() => () => { Object.values(sources.current).forEach((es) => es.close()) }, [])

  async function install(p: Plugin) {
    setBusy(p.key)
    setLogs((s) => ({ ...s, [p.key]: [] }))
    try {
      await api(`/admin/plugins/${p.key}/install`, { method: 'POST' })
      openLogs(p.key)
      load()
    } catch (e) {
      showToast({ title: '安装失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function uninstall(p: Plugin) {
    if (!(await confirmAction({ title: '卸载插件', message: `确定卸载「${p.name}」？将删除已下载的文件。`, confirmLabel: '卸载', danger: true }))) return
    setBusy(p.key)
    try {
      openLogs(p.key)
      await api(`/admin/plugins/${p.key}/uninstall`, { method: 'POST' })
      load()
    } catch (e) {
      showToast({ title: '卸载失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  function toggleLogs(key: string) {
    if (logOpen[key]) {
      sources.current[key]?.close()
      setLogOpen((s) => ({ ...s, [key]: false }))
    } else {
      openLogs(key)
    }
  }

  function statusBadge(p: Plugin) {
    if (p.status === 'downloading') return <Badge tone="amber">安装中…</Badge>
    if (p.installed) return <Badge tone="emerald">已安装{p.version ? ` · v${p.version}` : ''}</Badge>
    if (p.status === 'failed') return <Badge tone="rose">安装失败</Badge>
    return <Badge tone="slate">未安装</Badge>
  }

  const levelColor: Record<string, string> = { info: 'text-slate-300', success: 'text-emerald-400', error: 'text-rose-400' }

  return (
    <AdminLayout current="plugins" breadcrumb="插件">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">插件</h1>
        <p className="mt-1.5 text-sm text-slate-500">安装后台功能插件；部分功能（如 PDF 导出）依赖插件，未安装则不可用。</p>
      </div>

      {items === null ? (
        <Loading className="py-16" label="正在加载插件…" />
      ) : (
        <div className="space-y-4">
          {items.map((p) => {
            const pluginLogs = logs[p.key] || []
            return (
              <div key={p.key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{p.name}</h2>
                      {statusBadge(p)}
                      <span className="text-xs text-slate-400">{p.size_hint}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">{p.description}</p>
                    {p.status === 'failed' && p.error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{p.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => toggleLogs(p.key)}>{logOpen[p.key] ? '隐藏日志' : '查看日志'}</Button>
                    {p.installed ? (
                      <Button variant="outline" disabled={busy === p.key} onClick={() => uninstall(p)}>卸载</Button>
                    ) : (
                      <Button loading={busy === p.key || p.status === 'downloading'} disabled={p.status === 'downloading'} onClick={() => install(p)}>
                        {p.status === 'downloading' ? '安装中…' : '安装'}
                      </Button>
                    )}
                  </div>
                </div>

                {logOpen[p.key] && (
                  <div className="mt-4 max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-6">
                    {pluginLogs.length === 0 ? (
                      <span className="text-slate-500">暂无日志…</span>
                    ) : pluginLogs.map((l, i) => (
                      <div key={i} className={levelColor[l.level] || 'text-slate-300'}>
                        <span className="text-slate-500">{l.time}</span> {l.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AdminLayout>
  )
}
