import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import Link from 'next/link'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { api, formatNumber } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
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
  { value: '7', labelKey: 'bookSettings.analytics.period.7' },
  { value: '30', labelKey: 'bookSettings.analytics.period.30' },
  { value: '90', labelKey: 'bookSettings.analytics.period.90' },
  { value: '180', labelKey: 'bookSettings.analytics.period.180' },
]

const SOURCE_KEYS: Record<string, string> = {
  direct: 'bookSettings.analytics.source.direct',
  internal: 'bookSettings.analytics.source.internal',
  search: 'bookSettings.analytics.source.search',
  social: 'bookSettings.analytics.source.social',
  external: 'bookSettings.analytics.source.external',
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
  const { t } = useTranslation()
  const max = Math.max(1, ...points.map((point) => point.views))
  const total = points.reduce((sum, point) => sum + point.views, 0)
  if (total === 0) return <EmptyState>{t('bookSettings.analytics.empty.trend')}</EmptyState>
  return (
    <div>
      <div className="flex h-52 items-end gap-1 border-b border-slate-200 px-1" role="img" aria-label={t('bookSettings.analytics.aria.trendChart')}>
        {points.map((point) => (
          <span key={point.date} className="group relative flex min-w-0 flex-1 items-end justify-center" style={{ height: '100%' }}
            aria-label={t('bookSettings.analytics.aria.trendPoint', { date: point.date, count: point.views })}>
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
  const { t } = useTranslation()
  const [days, setDays] = useState('30')
  const [data, setData] = useState<AnalyticsResult | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (nextDays: string) => {
    setLoading(true)
    try {
      setData(await api<AnalyticsResult>(`/books/${book.id}/analytics?days=${nextDays}`))
    } catch (error) {
      showToast({ title: t('bookSettings.analytics.error.load.title'), message: (error as Error).message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }, [book.id, showToast, t])

  useEffect(() => { void load(days) }, [days, load])

  const maxSource = useMemo(() => Math.max(1, ...(data?.sources || []).map((source) => source.view_count)), [data])

  return (
    <BookSettingsLayout book={book} active="analytics">
      <div className="space-y-5">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('bookSettings.analytics.title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('bookSettings.analytics.desc')}</p>
          </div>
          <SegmentedTabs size="sm" value={days} items={PERIODS.map((p) => ({ value: p.value, label: t(p.labelKey) }))} ariaLabel={t('bookSettings.analytics.aria.period')} onChange={setDays} />
        </Card>

        {loading || !data ? (
          <Card><Loading label={t('bookSettings.analytics.loading')} /></Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label={t('bookSettings.analytics.metric.lifetime')} value={formatNumber(data.lifetime_views)} hint={t('bookSettings.analytics.metric.lifetimeHint')}
                icon={<EyeIcon className="h-5 w-5" />} />
              <MetricCard label={t('bookSettings.analytics.metric.period', { days: data.days })} value={formatNumber(data.period_views)}
                hint={data.growth_percent === null ? t('bookSettings.analytics.metric.periodHintNull') : t('bookSettings.analytics.metric.periodHint', { percent: `${data.growth_percent >= 0 ? '+' : ''}${data.growth_percent}` })}
                icon={<i className="fa-solid fa-chart-line text-base" aria-hidden="true" />} />
              <MetricCard label={t('bookSettings.analytics.metric.readers')} value={formatNumber(data.registered_readers)} hint={t('bookSettings.analytics.metric.readersHint')}
                icon={<UsersIcon className="h-5 w-5" />} />
              <MetricCard label={t('bookSettings.analytics.metric.completion')} value={`${data.completion_rate}%`}
                hint={t('bookSettings.analytics.metric.completionHint', { count: data.completed_readers })}
                icon={<CheckCircleSmallIcon className="h-5 w-5" />} />
            </div>

            <Card className="p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">{t('bookSettings.analytics.trend.title')}</h3>
                  <p className="mt-1 text-xs text-slate-400">{t('bookSettings.analytics.trend.retention', { days: data.retention_days })}</p>
                </div>
                <span className="text-sm text-slate-500">{t('bookSettings.analytics.trend.previous', { count: formatNumber(data.previous_views) })}</span>
              </div>
              <TrendChart points={data.trend} />
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-6 py-5">
                  <h3 className="font-bold text-slate-900">{t('bookSettings.analytics.popular.title')}</h3>
                  <p className="mt-1 text-xs text-slate-400">{t('bookSettings.analytics.popular.desc')}</p>
                </div>
                {data.popular_chapters.length === 0 ? <EmptyState>{t('bookSettings.analytics.popular.empty')}</EmptyState> : (
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
                <h3 className="font-bold text-slate-900">{t('bookSettings.analytics.sources.title')}</h3>
                <p className="mt-1 text-xs text-slate-400">{t('bookSettings.analytics.sources.desc')}</p>
                {data.sources.length === 0 ? <EmptyState>{t('bookSettings.analytics.sources.empty')}</EmptyState> : (
                  <div className="mt-5 space-y-4">
                    {data.sources.map((source) => (
                      <div key={source.source}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="text-slate-600">{SOURCE_KEYS[source.source] ? t(SOURCE_KEYS[source.source]) : source.source}</span>
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
                <h3 className="font-bold text-slate-900">{t('bookSettings.analytics.funnel.title')}</h3>
                <p className="mt-1 text-xs text-slate-400">{t('bookSettings.analytics.funnel.desc')}</p>
              </div>
              {data.chapter_funnel.length === 0 ? <EmptyState>{t('bookSettings.analytics.funnel.empty')}</EmptyState> : (
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
                            {t('bookSettings.analytics.funnel.readers', { count: formatNumber(chapter.readers) })}{first > 0 && index > 0 ? ` · ${Math.round(ratio)}%` : ''}
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
