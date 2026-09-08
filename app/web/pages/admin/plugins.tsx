import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
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

// 管理控制台 · 插件：安装/卸载后台功能插件（如 PDF 导出）
export default function AdminPlugins() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { showToast, confirmAction } = useFeedback()
  const [items, setItems] = useState<Plugin[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    api<{ items: Plugin[] }>('/admin/plugins').then((r) => setItems(r.items)).catch(() => {})
  }, [])
  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  // 下载中时轮询状态
  useEffect(() => {
    if (!items?.some((p) => p.status === 'downloading')) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [items, load])

  async function install(p: Plugin) {
    setBusy(p.key)
    try {
      await api(`/admin/plugins/${p.key}/install`, { method: 'POST' })
      showToast({ title: '开始安装', message: '正在后台下载，请稍候…', tone: 'success' })
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
      await api(`/admin/plugins/${p.key}/uninstall`, { method: 'POST' })
      load()
    } catch (e) {
      showToast({ title: '卸载失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  function statusBadge(p: Plugin) {
    if (p.status === 'downloading') return <Badge tone="amber">下载中…</Badge>
    if (p.installed) return <Badge tone="emerald">已安装{p.version ? ` · v${p.version}` : ''}</Badge>
    if (p.status === 'failed') return <Badge tone="rose">安装失败</Badge>
    return <Badge tone="slate">未安装</Badge>
  }

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
          {items.map((p) => (
            <div key={p.key} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{p.name}</h2>
                  {statusBadge(p)}
                  <span className="text-xs text-slate-400">{p.size_hint}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-500">{p.description}</p>
                {p.status === 'failed' && p.error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{p.error}</p>}
              </div>
              <div className="shrink-0">
                {p.installed ? (
                  <Button variant="outline" disabled={busy === p.key} onClick={() => uninstall(p)}>卸载</Button>
                ) : (
                  <Button loading={busy === p.key || p.status === 'downloading'} disabled={p.status === 'downloading'} onClick={() => install(p)}>
                    {p.status === 'downloading' ? '安装中…' : '安装'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
