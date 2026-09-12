import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Container from '@/components/Container'
import { api, formatNumber } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Card, EmptyState, Loading, SegmentedTabs, Tooltip } from '@/components/ui'
import Seo from '@/components/Seo'
import { BookIcon, EyeIcon, UsersIcon, CheckCircleSmallIcon } from '@/components/icons'

interface AuthorBookRow {
  id: number
  title: string
  slug: string
  status: string
  is_public: boolean
  lifetime_views: number
  period_views: number
  previous_views: number
  growth_percent: number | null
  chapters: number
  registered_readers: number
  completed_readers: number
  completion_rate: number
  updated_at: string
}

interface AuthorAnalytics {
  days: number
  total_books: number
  published_books: number
  total_lifetime_views: number
  total_period_views: number
  total_previous_views: number
  total_growth_percent: number | null
  total_readers: number
  books: AuthorBookRow[]
}

interface RetentionCohort {
  week: string
  size: number
  retention: number[]
}

interface ReaderRetention {
  weeks: number
  cohorts: RetentionCohort[]
  curve: (number | null)[]
}

const PERIODS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: '180', label: '近 180 天' },
]

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', in_progress: '进行中', published: '已发布', completed: '已完成', archived: '已归档',
}

type SortKey = 'lifetime_views' | 'period_views' | 'registered_readers' | 'completion_rate' | 'chapters'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'chapters', label: '章节' },
  { key: 'lifetime_views', label: '累计浏览' },
  { key: 'period_views', label: '周期浏览' },
  { key: 'registered_readers', label: '读者' },
  { key: 'completion_rate', label: '完成率' },
]

// StatTile 概览磁贴，视觉对齐「我在读」页与首页统计条。
function StatTile({ icon, label, value, hint, tone }: { icon: string; label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold tabular-nums text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{label}{hint ? ` · ${hint}` : ''}</span>
      </span>
    </div>
  )
}

// GrowthTag 环比增幅标签：正增长绿、负增长红、上期无数据灰。
function GrowthTag({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-300">—</span>
  const up = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      <i className={`fa-solid ${up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} aria-hidden="true" />
      {up ? '+' : ''}{value}%
    </span>
  )
}

// retentionCellClass 按留存比例分档着色（相对本队列人数）。
function retentionCellClass(ratio: number): string {
  if (ratio <= 0) return 'bg-slate-50 text-slate-300'
  if (ratio < 0.25) return 'bg-primary-100 text-primary-700'
  if (ratio < 0.5) return 'bg-primary-200 text-primary-800'
  if (ratio < 0.75) return 'bg-primary-400 text-white'
  return 'bg-primary-600 text-white'
}

// RetentionSection 读者留存：按「首次阅读周」分组的队列三角矩阵 + 加权聚合曲线。
function RetentionSection() {
  const [data, setData] = useState<ReaderRetention | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<ReaderRetention>('/users/me/reader-retention')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => (data?.cohorts || []).filter((c) => c.size > 0), [data])
  const curvePoints = useMemo(() => (data?.curve || []).map((v, i) => ({ offset: i, value: v })).filter((p) => p.value !== null), [data])

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="font-bold text-slate-900">读者留存</h2>
        <p className="mt-1 text-xs text-slate-400">以读者「首次阅读周」分组，跟踪其后续各周仍有阅读的比例（近 {data?.weeks || 12} 周）</p>
      </div>

      {loading ? (
        <Loading label="正在计算读者留存…" />
      ) : !data || rows.length === 0 ? (
        <EmptyState>近 {data?.weeks || 12} 周内还没有新读者的留存数据</EmptyState>
      ) : (
        <div className="space-y-6 p-6">
          {/* 加权聚合曲线 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">整体留存曲线</h3>
            <div className="flex h-32 items-end gap-1.5 border-b border-slate-200" role="img" aria-label="整体留存曲线">
              {curvePoints.map((p) => (
                <div key={p.offset} className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
                  <span className="mb-1 text-[10px] tabular-nums text-slate-400">{p.value}%</span>
                  <span className="w-full max-w-[40px] rounded-t bg-primary-400" style={{ height: `${Math.max(2, p.value as number)}%` }}
                    aria-label={`第 ${p.offset} 周留存 ${p.value}%`} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {curvePoints.map((p) => (
                <span key={p.offset} className="min-w-0 flex-1 text-center text-[10px] text-slate-400">{p.offset}周</span>
              ))}
            </div>
          </div>

          {/* 队列三角矩阵 */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">队列明细</h3>
            <div className="overflow-x-auto">
              <table className="min-w-[560px] border-separate" style={{ borderSpacing: '3px' }}>
                <thead>
                  <tr className="text-[10px] text-slate-400">
                    <th className="px-2 text-left font-medium">首读周</th>
                    <th className="px-2 text-right font-medium">新读者</th>
                    {Array.from({ length: data.weeks }, (_, i) => (
                      <th key={i} className="w-10 text-center font-medium">{i}周</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((cohort) => (
                    <tr key={cohort.week}>
                      <td className="whitespace-nowrap px-2 text-xs tabular-nums text-slate-500">{cohort.week.slice(5)}</td>
                      <td className="px-2 text-right text-xs font-medium tabular-nums text-slate-700">{cohort.size}</td>
                      {Array.from({ length: data.weeks }, (_, offset) => {
                        const count = cohort.retention[offset]
                        if (count === undefined) return <td key={offset} className="h-9 w-10" />
                        const ratio = cohort.size > 0 ? count / cohort.size : 0
                        return (
                          <td key={offset} className="h-9 w-10">
                            <Tooltip content={`${cohort.week} 起第 ${offset} 周 · ${count}/${cohort.size} 人 · ${Math.round(ratio * 100)}%`} className="block h-full w-full">
                              <span className={`flex h-9 w-full items-center justify-center rounded text-[11px] font-medium tabular-nums ${retentionCellClass(ratio)}`}>
                                {Math.round(ratio * 100)}
                              </span>
                            </Tooltip>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-slate-400">数字为该周仍有阅读的读者占本队列的百分比；越靠右代表首读后越久</p>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function AuthorAnalyticsPage() {
  const user = useRequireAuth()
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [days, setDays] = useState('30')
  const [data, setData] = useState<AuthorAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('period_views')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    api<AuthorAnalytics>('/users/me/author-analytics', { params: { days } })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [user, days])

  const sorted = useMemo(() => {
    const rows = [...(data?.books || [])]
    rows.sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'asc' ? diff : -diff
    })
    return rows
  }, [data, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (!user) return <Loading className="min-h-[60vh]" label="正在验证登录状态…" />

  return (
    <>
      <Seo siteName={siteName} title="创作数据" noindex />
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-3 pb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">创作数据</h1>
            <p className="mt-1 text-sm text-slate-500">横向对比你的全部作品，跟踪周期环比与读者完成情况</p>
          </div>
          <SegmentedTabs size="sm" value={days} items={PERIODS} ariaLabel="统计周期" onChange={setDays} />
        </div>

        {loading || data === null ? (
          <Loading label="正在汇总创作数据…" />
        ) : data.total_books === 0 ? (
          <EmptyState>
            <BookIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            你还没有创建作品，去<Link href="/books" className="text-primary-600 hover:underline">我的书籍</Link>发布第一本吧
          </EmptyState>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile icon="fa-book" label="作品" hint={`${data.published_books} 本已发布`} value={String(data.total_books)} tone="bg-primary-50 text-primary-500" />
              <StatTile icon="fa-eye" label="累计浏览" value={formatNumber(data.total_lifetime_views)} tone="bg-sky-50 text-sky-500" />
              <StatTile icon="fa-chart-line" label={`${data.days} 天浏览`}
                hint={data.total_growth_percent === null ? '上期无数据' : `环比 ${data.total_growth_percent >= 0 ? '+' : ''}${data.total_growth_percent}%`}
                value={formatNumber(data.total_period_views)} tone="bg-violet-50 text-violet-500" />
              <StatTile icon="fa-users" label="登录读者" value={formatNumber(data.total_readers)} tone="bg-emerald-50 text-emerald-500" />
            </div>

            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="font-bold text-slate-900">作品对比</h2>
                <p className="mt-1 text-xs text-slate-400">点击表头按对应指标排序；点击书名查看单本详细分析</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                      <th className="px-6 py-3 font-medium">书籍</th>
                      {COLUMNS.map((col) => (
                        <th key={col.key} className="px-4 py-3 font-medium">
                          <button type="button" onClick={() => toggleSort(col.key)}
                            className={`inline-flex items-center gap-1 transition-colors hover:text-slate-700 ${sortKey === col.key ? 'text-slate-700' : ''}`}>
                            {col.label}
                            <i className={`fa-solid text-[10px] ${sortKey === col.key ? (sortDir === 'desc' ? 'fa-caret-down' : 'fa-caret-up') : 'fa-sort text-slate-300'}`} aria-hidden="true" />
                          </button>
                        </th>
                      ))}
                      <th className="px-4 py-3 font-medium">环比</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sorted.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-6 py-3.5">
                          <Link href={`/book/settings/${encodeURIComponent(row.slug)}/analytics`}
                            className="block max-w-[220px] truncate font-medium text-slate-800 hover:text-primary-600">{row.title}</Link>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                            <span className={`rounded px-1.5 py-0.5 ${row.status === 'published' || row.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                              {STATUS_LABELS[row.status] || row.status}
                            </span>
                            {!row.is_public && <span className="text-slate-400">私有</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-600">{row.chapters}</td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-600">{formatNumber(row.lifetime_views)}</td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-600">{formatNumber(row.period_views)}</td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-600">{formatNumber(row.registered_readers)}</td>
                        <td className="px-4 py-3.5 tabular-nums text-slate-600">{row.completion_rate}%</td>
                        <td className="px-4 py-3.5"><GrowthTag value={row.growth_percent} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <RetentionSection />

            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" /> 浏览含书籍详情与章节</span>
              <span className="inline-flex items-center gap-1"><UsersIcon className="h-3.5 w-3.5" /> 读者指保存过阅读进度的登录用户</span>
              <span className="inline-flex items-center gap-1"><CheckCircleSmallIcon className="h-3.5 w-3.5" /> 完成率=读完全部已发布章节的读者占比</span>
            </p>
          </>
        )}
      </Container>
    </>
  )
}
