import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AdminLayout from '@/components/AdminLayout'
import { api, formatDate } from '@/lib/api'
import { aiFeatureLabel, formatCost, formatTokens, type UsageAgg } from '@/lib/ai-usage'
import { Badge, Card, EmptyState, Input, Loading, Pagination, SegmentedTabs, Select, Tooltip, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface Summary {
  days: number
  currency: string
  total: UsageAgg
  daily: { date: string; calls: number; tokens: number; cost_micros: number }[]
  by_feature: (UsageAgg & { key: string })[]
  by_model: (UsageAgg & { key: string })[]
  top_users: { user_id: number; username: string; usage: UsageAgg }[]
  features: string[]
}

interface LogItem {
  log: {
    id: number; user_id: number; feature: string; ref_type: string; ref_id: number; kind: 'chat' | 'embed'; model: string
    input_tokens: number; output_tokens: number; estimated: boolean; cost_micros: number; currency: string
    duration_ms: number; status: 'ok' | 'error'; error: string; created_at: string
  }
  username: string
}

const PERIODS = ['7', '30', '90']

// 管理后台 · AI 用量：站点 AI 服务的调用次数、tokens 与估算费用（按功能/模型/用户），以及调用明细
export default function AdminAIUsage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { showToast } = useFeedback()
  const days = PERIODS.includes(String(router.query.days)) ? String(router.query.days) : '30' // 周期由 URL 驱动
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    if (!router.isReady) return
    setSummary(null)
    api<Summary>('/admin/ai/usage', { params: { days } })
      .then(setSummary)
      .catch((e) => showToast({ title: t('admin.aiUsage.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [router.isReady, days, showToast, t])

  const tokens = (u: UsageAgg) => u.input_tokens + u.output_tokens
  const maxDay = Math.max(1, ...(summary?.daily || []).map((d) => d.tokens))

  return (
    <AdminLayout current="ai-usage" breadcrumb={t('admin.nav.aiUsage')}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.nav.aiUsage')}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t('admin.aiUsage.description')} <Link href="/admin/settings/ai" className="font-medium text-primary-600 hover:text-primary-700">{t('admin.aiUsage.pricingLink')}</Link></p>
        </div>
        <SegmentedTabs value={days} ariaLabel={t('admin.aiUsage.period')} size="sm"
          items={PERIODS.map((d) => ({ value: d, label: t('admin.aiUsage.lastDays', { n: d }), href: `/admin/ai-usage?days=${d}` }))} />
      </div>

      {!summary ? <Loading className="mt-8" label={t('admin.aiUsage.loading')} /> : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={t('admin.aiUsage.calls')} value={summary.total.calls.toLocaleString()}
              hint={summary.total.errors ? t('admin.aiUsage.errors', { n: summary.total.errors }) : undefined} />
            <Metric label={t('admin.aiUsage.inputTokens')} value={formatTokens(summary.total.input_tokens)} />
            <Metric label={t('admin.aiUsage.outputTokens')} value={formatTokens(summary.total.output_tokens)} />
            <Metric label={t('admin.aiUsage.cost')} value={formatCost(summary.total.cost_micros, summary.currency)} hint={t('admin.aiUsage.costHint')} />
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">{t('admin.aiUsage.dailyTitle')}</h2>
            <div className="mt-4 flex h-40 items-end gap-[2px]">
              {summary.daily.map((d) => (
                <Tooltip key={d.date} content={t('admin.aiUsage.dayTip', { date: d.date, tokens: formatTokens(d.tokens), calls: d.calls, cost: formatCost(d.cost_micros, summary.currency) })}>
                  <div className="flex h-40 min-w-0 flex-1 items-end">
                    <div className={`w-full rounded-t ${d.tokens ? 'bg-primary-400 hover:bg-primary-500' : 'bg-slate-100'}`}
                      style={{ height: `${Math.max(2, (d.tokens / maxDay) * 100)}%` }} />
                  </div>
                </Tooltip>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>{summary.daily[0]?.date}</span><span>{summary.daily[summary.daily.length - 1]?.date}</span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Breakdown title={t('admin.aiUsage.byFeature')} rows={summary.by_feature.map((r) => ({ key: r.key, label: aiFeatureLabel(t, r.key), usage: r }))} currency={summary.currency} />
            <Breakdown title={t('admin.aiUsage.byModel')} rows={summary.by_model.map((r) => ({ key: r.key, label: r.key, usage: r }))} currency={summary.currency} />
            <Breakdown title={t('admin.aiUsage.topUsers')} rows={summary.top_users.map((r) => ({
              key: String(r.user_id), label: r.user_id ? (r.username || `#${r.user_id}`) : t('admin.aiUsage.system'), usage: r.usage,
            }))} currency={summary.currency} />
          </div>
          {tokens(summary.total) === 0 && summary.total.calls === 0 && <EmptyState>{t('admin.aiUsage.empty')}</EmptyState>}

          <UsageLogs features={summary.features} />
        </div>
      )}
    </AdminLayout>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Card>
  )
}

function Breakdown({ title, rows, currency }: { title: string; rows: { key: string; label: string; usage: UsageAgg }[]; currency: string }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...rows.map((r) => r.usage.input_tokens + r.usage.output_tokens))
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? <p className="mt-4 text-sm text-slate-400">{t('admin.aiUsage.noData')}</p> : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => {
            const tk = r.usage.input_tokens + r.usage.output_tokens
            return (
              <li key={r.key}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-700">{r.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-900">{formatTokens(tk)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary-400" style={{ width: `${(tk / max) * 100}%` }} /></div>
                <div className="mt-1 text-xs text-slate-400">{t('admin.aiUsage.rowMeta', { calls: r.usage.calls, cost: formatCost(r.usage.cost_micros, currency) })}</div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function UsageLogs({ features }: { features: string[] }) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [feature, setFeature] = useState('')
  const [status, setStatus] = useState('')
  const [userInput, setUserInput] = useState('')
  const [user, setUser] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: LogItem[]; total: number; page_size: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api('/admin/ai/usage/logs', { params: { feature, status, user, page, page_size: 20 } }))
    } catch (e) {
      showToast({ title: t('admin.aiUsage.loadFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }, [feature, status, user, page, showToast, t])

  useEffect(() => { void load() }, [load])

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-slate-900">{t('admin.aiUsage.logsTitle')}</h2>
        <Select size="sm" className="w-40" value={feature} onChange={(v) => { setFeature(v); setPage(1) }}
          options={[{ value: '', label: t('admin.aiUsage.allFeatures') }, ...features.map((f) => ({ value: f, label: aiFeatureLabel(t, f) }))]} />
        <Select size="sm" className="w-28" value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={[
          { value: '', label: t('admin.aiUsage.allStatus') },
          { value: 'ok', label: t('admin.aiUsage.statusOk') },
          { value: 'error', label: t('admin.aiUsage.statusError') },
        ]} />
        <form onSubmit={(e) => { e.preventDefault(); setUser(userInput.trim()); setPage(1) }}>
          <Input size="sm" className="w-40" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder={t('admin.aiUsage.userPlaceholder')} aria-label={t('admin.aiUsage.userPlaceholder')} />
        </form>
      </div>
      {loading && !data ? <Loading className="py-8" /> : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{t('admin.aiUsage.noLogs')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="py-2 pr-3 font-medium">{t('admin.aiUsage.colTime')}</th>
                <th className="py-2 pr-3 font-medium">{t('admin.aiUsage.colUser')}</th>
                <th className="py-2 pr-3 font-medium">{t('admin.aiUsage.colFeature')}</th>
                <th className="py-2 pr-3 font-medium">{t('admin.aiUsage.colModel')}</th>
                <th className="py-2 pr-3 text-right font-medium">{t('admin.aiUsage.colTokens')}</th>
                <th className="py-2 pr-3 text-right font-medium">{t('admin.aiUsage.colCost')}</th>
                <th className="py-2 pr-3 text-right font-medium">{t('admin.aiUsage.colDuration')}</th>
                <th className="py-2 font-medium">{t('admin.aiUsage.colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map(({ log: l, username }) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{formatDate(l.created_at)}</td>
                  <td className="py-2 pr-3 text-slate-700">{l.user_id ? (username || `#${l.user_id}`) : t('admin.aiUsage.system')}</td>
                  <td className="py-2 pr-3 text-slate-700">{aiFeatureLabel(t, l.feature)}</td>
                  <td className="py-2 pr-3 text-slate-500">{l.model || '-'}<span className="ml-1 text-xs text-slate-400">· {t(l.kind === 'embed' ? 'admin.aiUsage.kindEmbed' : 'admin.aiUsage.kindChat')}</span></td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-700">
                    {formatTokens(l.input_tokens)} / {formatTokens(l.output_tokens)}
                    {l.estimated && <Tooltip content={t('admin.aiUsage.estimatedHint')}><span className="ml-1 text-xs text-amber-600">≈</span></Tooltip>}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-500">{formatCost(l.cost_micros, l.currency || 'USD')}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-500">{(l.duration_ms / 1000).toFixed(1)}s</td>
                  <td className="py-2">
                    {l.status === 'ok' ? <Badge tone="emerald">{t('admin.aiUsage.statusOk')}</Badge> : (
                      <Tooltip content={l.error || t('admin.aiUsage.statusError')}><span><Badge tone="rose">{t('admin.aiUsage.statusError')}</Badge></span></Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > data.page_size && <div className="mt-4"><Pagination size="sm" page={page} pageSize={data.page_size} total={data.total} onChange={setPage} /></div>}
    </Card>
  )
}
