import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { api, API_BASE, getToken } from '@/lib/api'
import { useApp } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import { Badge, Button, EmptyState, Loading, SegmentedTabs, Switch, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface Plugin {
  key: string
  name: string
  description: string
  size_hint: string
  kind: 'runtime' | 'feature'
  builtin: boolean
  installed: boolean
  version: string
  status?: string
  error?: string
}

type PluginTab = 'builtin' | 'external'

interface LogLine { time: string; level: string; text: string }

// 管理控制台 · 插件：安装/卸载后台功能插件（如 PDF 导出），实时日志经 SSE 推送
export default function AdminPlugins() {
  const { user, refreshSite } = useApp()
  const isAdmin = user?.role === 'admin'
  const { showToast, confirmAction } = useFeedback()
  const { t } = useTranslation()
  const router = useRouter()
  // Tab 用查询参数承载（不用本地 state），可分享/回退/刷新保持
  const tab: PluginTab = router.query.type === 'external' ? 'external' : 'builtin'
  const setTab = (next: PluginTab) => router.push({ query: next === 'builtin' ? {} : { type: next } }, undefined, { shallow: true })
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
    setLogs((s) => ({ ...s, [key]: [] }))
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
      showToast({ title: t('admin.plugins.installFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function uninstall(p: Plugin) {
    if (!(await confirmAction({ title: t('admin.plugins.uninstallTitle'), message: t('admin.plugins.uninstallMessage', { name: p.name }), confirmLabel: t('admin.plugins.uninstallConfirm'), danger: true }))) return
    setBusy(p.key)
    try {
      openLogs(p.key)
      await api(`/admin/plugins/${p.key}/uninstall`, { method: 'POST' })
      load()
    } catch (e) {
      showToast({ title: t('admin.plugins.uninstallFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // 特性插件的启用/禁用：即时切换开关，禁用前二次确认（会隐藏对应页面与接口）。切换后刷新站点配置以更新左侧菜单。
  async function toggleFeature(p: Plugin, next: boolean) {
    if (!next && !(await confirmAction({ title: t('admin.plugins.disableTitle'), message: t('admin.plugins.disableMessage', { name: p.name }), confirmLabel: t('admin.plugins.disableConfirm'), danger: true }))) return
    setBusy(p.key)
    try {
      await api(`/admin/plugins/${p.key}/${next ? 'install' : 'uninstall'}`, { method: 'POST' })
      load()
      await refreshSite()
      showToast({ message: next ? t('admin.plugins.enabled') : t('admin.plugins.disabled'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('admin.plugins.saveFailed'), message: (e as Error).message, tone: 'error' })
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
    if (p.status === 'downloading') return <Badge tone="amber">{t('admin.plugins.status.installing')}</Badge>
    if (p.installed) return <Badge tone="emerald">{t('admin.plugins.status.installed', { version: p.version })}</Badge>
    if (p.status === 'failed') return <Badge tone="rose">{t('admin.plugins.status.failed')}</Badge>
    return <Badge tone="slate">{t('admin.plugins.status.notInstalled')}</Badge>
  }

  const levelColor: Record<string, string> = { info: 'text-slate-300', success: 'text-emerald-400', error: 'text-rose-400' }

  return (
    <AdminLayout current="plugins" breadcrumb={t('admin.nav.plugins')}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.nav.plugins')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('admin.plugins.description')}</p>
      </div>

      <SegmentedTabs className="mb-6" value={tab} onChange={(value) => setTab(value as PluginTab)} ariaLabel={t('admin.nav.plugins')} items={[
        { value: 'builtin', label: t('admin.plugins.tab.builtin') },
        { value: 'external', label: t('admin.plugins.tab.external') },
      ]} />

      {items === null ? (
        <Loading className="py-16" label={t('admin.plugins.loading')} />
      ) : items.filter((p) => p.builtin === (tab === 'builtin')).length === 0 ? (
        <EmptyState>{tab === 'external' ? t('admin.plugins.externalEmpty') : t('admin.plugins.builtinEmpty')}</EmptyState>
      ) : (
        <div className="space-y-4">
          {items.filter((p) => p.builtin === (tab === 'builtin')).map((p) => {
            const pluginLogs = logs[p.key] || []
            const isFeature = p.kind === 'feature'
            return (
              <div key={p.key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{p.name}</h2>
                      {isFeature
                        ? <Badge tone={p.installed ? 'emerald' : 'slate'}>{p.installed ? t('admin.plugins.status.enabled') : t('admin.plugins.status.disabled')}</Badge>
                        : statusBadge(p)}
                      {!isFeature && p.size_hint && <span className="text-xs text-slate-400">{p.size_hint}</span>}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">{p.description}</p>
                    {p.status === 'failed' && p.error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{p.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {isFeature ? (
                      <Switch ariaLabel={p.name} checked={p.installed} disabled={busy === p.key} onChange={(next) => toggleFeature(p, next)} />
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => toggleLogs(p.key)}>{logOpen[p.key] ? t('admin.plugins.hideLogs') : t('admin.plugins.viewLogs')}</Button>
                        {p.installed ? (
                          <Button variant="outline" disabled={busy === p.key} onClick={() => uninstall(p)}>{t('admin.plugins.uninstall')}</Button>
                        ) : (
                          <Button loading={busy === p.key || p.status === 'downloading'} disabled={p.status === 'downloading'} onClick={() => install(p)}>
                            {p.status === 'downloading' ? t('admin.plugins.status.installing') : t('admin.plugins.install')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {!isFeature && logOpen[p.key] && (
                  <div className="mt-4 max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-6">
                    {pluginLogs.length === 0 ? (
                      <span className="text-slate-500">{t('admin.plugins.noLogs')}</span>
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
