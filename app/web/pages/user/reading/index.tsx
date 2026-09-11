import { useEffect, useState } from 'react'
import Container from '@/components/Container'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, ButtonLink, EmptyState, Input, Loading, Pagination, Tooltip, useFeedback } from '@/components/ui'
import BookCard from '@/components/BookCard'
import Seo from '@/components/Seo'
import { BookIcon } from '@/components/icons'
import type { Book } from '@/lib/types'

interface ReadingItem {
  book: Book
  read_count: number
  total_chapters: number
  percentage: number
  last_doc_slug: string
  last_doc_title: string
  last_read_at: string
  read_seconds: number
}

// formatReadTime 把累计秒数格式化为「N 分钟 / N.N 小时」
function formatReadTime(seconds: number): string {
  if (!seconds || seconds < 60) return '不足 1 分钟'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  return `${(minutes / 60).toFixed(1)} 小时`
}

interface ReadingPage {
  items: ReadingItem[]
  total: number
  page: number
  page_size: number
}

interface ReadingStats {
  reading_books: number
  completed_books: number
  chapters_read: number
  streak_days: number
}

interface ActivityDay {
  date: string
  count: number
  met: boolean
}
interface ActivityData {
  goal: { daily_chapters: number }
  days: ActivityDay[]
  current_streak: number
  longest_streak: number
  today_count: number
  today_met: boolean
}

// CheckinCalendar 打卡日历：可配置每日目标（新读章节数）+ 近 12 周活动热力图 + 连续打卡。
function CheckinCalendar() {
  const { showToast } = useFeedback()
  const [data, setData] = useState<ActivityData | null>(null)
  const [goalInput, setGoalInput] = useState(1)
  const [saving, setSaving] = useState(false)

  const load = () => {
    api<ActivityData>('/users/me/reading-activity', { params: { days: 364 } })
      .then((d) => { setData(d); setGoalInput(d.goal.daily_chapters) })
      .catch(() => { /* 忽略 */ })
  }
  useEffect(() => { load() }, [])

  if (!data) return null
  const goal = data.goal.daily_chapters

  const saveGoal = async () => {
    setSaving(true)
    try {
      await api('/users/me/reading-goal', { method: 'PUT', body: { daily_chapters: goalInput } })
      load()
      showToast({ message: '每日目标已更新', tone: 'success' })
    } catch (e) {
      showToast({ message: (e as Error)?.message || '保存失败', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const cellColor = (d: ActivityDay) => {
    if (d.count === 0) return 'bg-slate-100'
    if (!d.met) return 'bg-primary-200'
    return d.count >= goal * 2 ? 'bg-primary-600' : 'bg-primary-500'
  }
  // 组织成「周列」（周日在最上）：首日之前补空，使第一格落在其星期几行
  const leadPad = data.days.length ? new Date(data.days[0].date + 'T00:00:00').getDay() : 0
  const padded: (ActivityDay | null)[] = [...Array(leadPad).fill(null), ...data.days]
  const weeks: (ActivityDay | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))
  const weekdayLabels = ['', '一', '', '三', '', '五', '']

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">阅读打卡</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-slate-400">
            连续打卡 <span className="font-semibold text-primary-600">{data.current_streak}</span> 天 · 最长 {data.longest_streak} 天 ·
            今日 {data.today_count}/{goal} 章
            {data.today_met && <i className="fa-solid fa-circle-check text-emerald-500" aria-label="已达标" />}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          <span>每日目标</span>
          <span className="inline-block w-16 shrink-0">
            <Input
              type="number" min={1} max={100} size="sm" value={goalInput}
              onChange={(e) => setGoalInput(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="text-center"
              aria-label="每日目标章节数"
            />
          </span>
          <span>章</span>
          <Button variant="ghost" size="sm" loading={saving} disabled={goalInput === goal} onClick={saveGoal}>保存</Button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex gap-1" style={{ minWidth: `${weeks.length * 10 + 24}px` }}>
          {/* 星期标签列（一/三/五），高度随格子自适应 */}
          <div className="flex shrink-0 flex-col gap-1 pr-1 text-[9px] leading-none text-slate-300">
            {weekdayLabels.map((w, i) => <span key={i} className="flex flex-1 items-center">{w}</span>)}
          </div>
          {/* 每周一列（从旧到新）：flex-1 平分宽度撑满卡片，格子 aspect-square 保持方形 */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-1 flex-col gap-1">
              {week.map((d, di) => (
                <div key={di} className="aspect-square w-full">
                  {d && (
                    <Tooltip content={`${d.date} · 读 ${d.count} 章${d.met ? ' · 已达标' : ''}`} className="h-full w-full">
                      <span className={`block h-full w-full rounded-sm ${cellColor(d)}`} />
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* 图例 */}
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-400">
        <span>少</span>
        <span className="h-3 w-3 rounded-sm bg-slate-100" />
        <span className="h-3 w-3 rounded-sm bg-primary-200" />
        <span className="h-3 w-3 rounded-sm bg-primary-500" />
        <span className="h-3 w-3 rounded-sm bg-primary-600" />
        <span>多</span>
      </div>
    </div>
  )
}

// StatTile 阅读概览磁贴，视觉对齐首页统计条。
function StatTile({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold tabular-nums text-slate-900">{value.toLocaleString('en-US')}</span>
        <span className="text-xs text-slate-400">{label}</span>
      </span>
    </div>
  )
}

// ReadingCard 复用全站 BookCard（grid 视图），在底部操作区叠加进度条与「继续阅读」。
function ReadingCard({ item }: { item: ReadingItem }) {
  const { book, read_count, total_chapters, percentage, last_doc_slug, last_doc_title, read_seconds } = item
  const resumeUrl = last_doc_slug
    ? `/book/reader/${encodeURIComponent(book.slug)}/${encodeURIComponent(last_doc_slug)}`
    : `/book/detail/${encodeURIComponent(book.slug)}`
  return (
    <BookCard
      book={book}
      view="grid"
      showViews={false}
      meta={
        <span>
          已读 {read_count}/{total_chapters} 章
          {read_seconds > 0 && <span className="text-slate-400"> · 阅读 {formatReadTime(read_seconds)}</span>}
        </span>
      }
      actions={
        <div className="w-full">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="truncate">上次读到：{last_doc_title || '未开始'}</span>
            <span className="tabular-nums text-slate-400">{percentage}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-primary-500 transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <ButtonLink href={resumeUrl} className="mt-3 w-full justify-center">
            <BookIcon className="h-4 w-4" /> 继续阅读
          </ButtonLink>
        </div>
      }
    />
  )
}

export default function MyReading() {
  const user = useRequireAuth()
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ReadingPage | null>(null)
  const [stats, setStats] = useState<ReadingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    api<ReadingPage>('/users/me/reading', { params: { page, page_size: 9 } })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: 9 }))
      .finally(() => setLoading(false))
  }, [user, page])

  useEffect(() => {
    if (!user) return
    api<ReadingStats>('/users/me/reading-stats').then(setStats).catch(() => { /* 概览失败不阻塞列表 */ })
  }, [user])

  if (!user) return <Loading className="min-h-[60vh]" label="正在验证登录状态…" />

  return (
    <>
      <Seo siteName={siteName} title="我在读" noindex />
      <Container>
        <div className="pb-6">
          <h1 className="text-2xl font-bold text-ink">我在读</h1>
          <p className="mt-1 text-sm text-slate-500">你正在阅读的全部书籍与进度</p>
        </div>

        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon="fa-book-open-reader" label="在读书籍" value={stats.reading_books} tone="bg-primary-50 text-primary-500" />
            <StatTile icon="fa-circle-check" label="已读完" value={stats.completed_books} tone="bg-emerald-50 text-emerald-500" />
            <StatTile icon="fa-list-check" label="累计已读章节" value={stats.chapters_read} tone="bg-sky-50 text-sky-500" />
            <StatTile icon="fa-fire" label="连续阅读(天)" value={stats.streak_days} tone="bg-amber-50 text-amber-500" />
          </div>
        )}

        <CheckinCalendar />

        {loading || data === null ? (
          <Loading label="正在加载阅读进度…" />
        ) : data.total === 0 ? (
          <EmptyState>还没有阅读记录，去发现页找一本开始阅读吧</EmptyState>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((item) => (
                <ReadingCard key={item.book.id} item={item} />
              ))}
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </>
        )}
      </Container>
    </>
  )
}
