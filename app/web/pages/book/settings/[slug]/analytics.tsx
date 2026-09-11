import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import Link from 'next/link'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { api, formatNumber } from '@/lib/api'
import { Card, EmptyState, Loading, SegmentedTabs, useFeedback } from '@/components/ui'
import { CheckCircleSmallIcon, EyeIcon, FileTextIcon, UsersIcon } from '@/components/icons'

export const getServerSideProps = getBookSettingsProps

interface TrendPoint {
  date: string
  views: number
}

interface PopularChapter {
  id: number
  title: string
  slug: string
  view_count: number
}

interface SourceItem {
  source: string
  view_count: number
  percentage: number
}

interface ChapterReach {
  id: number
  title: string
  slug: string
  sort_order: number
  readers: number
}

interface AnalyticsResult {
  days: number
  retention_days: number
  lifetime_views: number
  period_views: number
  previous_views: number
  growth_percent: number | null
  registered_readers: number
  completed_readers: number
  completion_rate: number
  trend: TrendPoint[]
  popular_chapters: PopularChapter[]
  sources: SourceItem[]
  chapter_funnel: ChapterReach[]
}

const PERIODS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
  { value: '180', label: '近 180 天' },
]

const SOURCE_LABELS: Record<string, string> = {
  direct: '直接访问', internal: '站内跳转', search: '搜索引擎', social: '社交媒体', external: '其他网站',
}

function MetricCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{label}</span><span className="text-primary-500">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </Card>
  )
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.views))
  const total = points.reduce((sum, point) => sum + point.views, 0)
  if (total === 0) return <EmptyState>所选周期内还没有访问记录</EmptyState>
  return (
    <div>
      <div className="flex h-52 items-end gap-1 border-b border-slate-200 px-1" role="img" aria-label="每日浏览趋势柱状图">
        {points.map((point) => (
          <span key={point.date} className="group relative flex min-w-0 flex-1 items-end justify-center" style={{ height: '100%' }}
            aria-label={`${point.date}，${point.views} 次浏览`}>
            <span className="w-full min-w-[2px] rounded-t bg-primary-200 transition-colors group-hover:bg-primary-500"
              style={{ height: `${Math.max(point.views > 0 ? 4 : 0, (point.views / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>{points[0]?.date}</span><span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  )
}

export default function BookAnalyticsPage({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast } = useFeedback()
  const [days, setDays] = useState('30')
  const [data, setData] = useState<AnalyticsResult | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (nextDays: string) => {
    setLoading(true)
    try {
      setData(await api<AnalyticsResult>(`/books/${book.id}/analytics?days=${nextDays}`))
    } catch (error) {
      showToast({ title: '分析数据加载失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }, [book.id, showToast])

  useEffect(() => { void load(days) }, [days, load])

  const maxSource = useMemo(() => Math.max(1, ...(data?.sources || []).map((source) => source.view_count)), [data])

  return (
    <BookSettingsLayout book={book} active="analytics">
      <div className="space-y-5">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">数据分析</h2>
            <p className="mt-1 text-sm text-slate-500">查看浏览趋势、热门章节、访问来源和登录读者完成率。</p>
          </div>
          <SegmentedTabs size="sm" value={days} items={PERIODS} ariaLabel="数据统计周期" onChange={setDays} />
        </Card>

        {loading || !data ? (
          <Card><Loading label="正在汇总分析数据…" /></Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="累计浏览" value={formatNumber(data.lifetime_views)} hint="书籍详情与章节累计"
                icon={<EyeIcon className="h-5 w-5" />} />
              <MetricCard label={`${data.days} 天浏览`} value={formatNumber(data.period_views)}
                hint={data.growth_percent === null ? '上一周期暂无数据' : `较上一周期 ${data.growth_percent >= 0 ? '+' : ''}${data.growth_percent}%`}
                icon={<i className="fa-solid fa-chart-line text-base" aria-hidden="true" />} />
              <MetricCard label="登录读者" value={formatNumber(data.registered_readers)} hint="保存过阅读进度的读者"
                icon={<UsersIcon className="h-5 w-5" />} />
              <MetricCard label="阅读完成率" value={`${data.completion_rate}%`}
                hint={`${data.completed_readers} 位读者已读完当前全部已发布章节`}
                icon={<CheckCircleSmallIcon className="h-5 w-5" />} />
            </div>

            <Card className="p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">每日浏览趋势</h3>
                  <p className="mt-1 text-xs text-slate-400">聚合数据最多保留 {data.retention_days} 天</p>
                </div>
                <span className="text-sm text-slate-500">上一周期 {formatNumber(data.previous_views)} 次</span>
              </div>
              <TrendChart points={data.trend} />
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h3 className="font-bold text-slate-900">热门章节</h3>
                  <p className="mt-1 text-xs text-slate-400">按所选周期的章节浏览量排序</p>
                </div>
                {data.popular_chapters.length === 0 ? <EmptyState>暂无章节访问记录</EmptyState> : (
                  <ol className="divide-y divide-slate-100">
                    {data.popular_chapters.map((chapter, index) => (
                      <li key={chapter.id} className="flex items-center gap-3 px-6 py-3.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
                        <FileTextIcon className="h-4 w-4 shrink-0 text-slate-300" />
                        <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${encodeURIComponent(chapter.slug)}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 hover:text-primary-600">{chapter.title}</Link>
                        <span className="shrink-0 text-sm text-slate-400">{formatNumber(chapter.view_count)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="font-bold text-slate-900">访问来源</h3>
                <p className="mt-1 text-xs text-slate-400">仅保留来源类别，不保存原始网址或访客身份</p>
                {data.sources.length === 0 ? <EmptyState>暂无来源数据</EmptyState> : (
                  <div className="mt-5 space-y-4">
                    {data.sources.map((source) => (
                      <div key={source.source}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="text-slate-600">{SOURCE_LABELS[source.source] || source.source}</span>
                          <span className="text-slate-400">{formatNumber(source.view_count)} · {source.percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-primary-400" style={{ width: `${(source.view_count / maxSource) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-5">
                <h3 className="font-bold text-slate-900">章节到达漏斗</h3>
                <p className="mt-1 text-xs text-slate-400">按章节顺序展示读过该章的去重读者数，条形与百分比相对首章，直观看出读者在哪一章流失</p>
              </div>
              {data.chapter_funnel.length === 0 ? <EmptyState>暂无章节阅读记录</EmptyState> : (
                <ol className="divide-y divide-slate-100">
                  {data.chapter_funnel.map((chapter, index) => {
                    const first = data.chapter_funnel[0]?.readers || 0
                    const ratio = first > 0 ? (chapter.readers / first) * 100 : 0
                    return (
                      <li key={chapter.id} className="px-6 py-3.5">
                        <div className="mb-1.5 flex items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
                          <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${encodeURIComponent(chapter.slug)}`}
                            className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 hover:text-primary-600">{chapter.title}</Link>
                          <span className="shrink-0 text-sm text-slate-400">
                            {formatNumber(chapter.readers)} 人{first > 0 && index > 0 ? ` · ${Math.round(ratio)}%` : ''}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-primary-400" style={{ width: `${ratio}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>
          </>
        )}
      </div>
    </BookSettingsLayout>
  )
}
