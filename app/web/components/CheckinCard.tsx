import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Button, Card, useFeedback } from '@/components/ui'

interface CheckinStatus {
  enabled: boolean
  today: string
  checked_today: boolean
  streak: number
  longest_streak: number
  total_days: number
  streak_bonus_days: number
  next_bonus_in: number
  month: string
  days: string[]
}
interface CheckinResult extends CheckinStatus { already: boolean; xp_awarded: number; milestone: boolean }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// CheckinCard 每日签到：签到按钮（幂等）、连续/累计/最长天数、下一次连续奖励提示与当月签到日历。
// 签到关闭（管理员设置）时不渲染。onCheckedIn 供外层刷新经验/等级。
export default function CheckinCard({ onCheckedIn }: { onCheckedIn?: () => void }) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [status, setStatus] = useState<CheckinStatus | null>(null)
  const [month, setMonth] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let alive = true
    api<CheckinStatus>('/users/me/checkin', { params: { month: month || undefined } })
      .then((r) => { if (alive) { setStatus(r); if (!month) setMonth(r.month) } })
      .catch(() => { /* 成长插件或签到不可用时不显示 */ })
    return () => { alive = false }
  }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  async function checkin() {
    setChecking(true)
    try {
      const r = await api<CheckinResult>('/users/me/checkin', { method: 'POST' })
      setStatus(r)
      setMonth(r.month)
      if (r.already) {
        showToast({ message: t('growth.checkin.already'), tone: 'info' })
      } else {
        const title = r.milestone ? t('growth.checkin.milestone', { days: r.streak }) : t('growth.checkin.done')
        showToast(r.xp_awarded > 0
          ? { title, message: t('growth.checkin.xpGained', { xp: r.xp_awarded }), tone: 'success' }
          : { message: title, tone: 'success' })
        onCheckedIn?.()
      }
    } catch (e) {
      showToast({ title: t('growth.checkin.failed'), message: (e as Error).message, tone: 'error' })
    } finally { setChecking(false) }
  }

  const cells = useMemo(() => {
    if (!status || !month) return []
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const daysInMonth = new Date(y, m, 0).getDate()
    const lead = (first.getDay() + 6) % 7 // 周一开头
    const checked = new Set(status.month === month ? status.days : [])
    const out: ({ day: number; key: string; checked: boolean; today: boolean } | null)[] = Array(lead).fill(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`
      out.push({ day: d, key, checked: checked.has(key), today: key === status.today })
    }
    return out
  }, [status, month])

  if (!status || !status.enabled) return null

  return (
    <Card className="mt-6 grid gap-6 p-6 md:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <h2 className="font-bold text-slate-900">{t('growth.checkin.title')}</h2>
        <p className="mt-1 text-xs text-slate-400">{t('growth.checkin.hint', { days: status.streak_bonus_days })}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {([
            ['streak', status.streak],
            ['total', status.total_days],
            ['longest', status.longest_streak],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-center">
              <div className="text-xl font-bold tabular-nums text-slate-900">{v}</div>
              <div className="mt-0.5 text-xs text-slate-400">{t(`growth.checkin.stat.${k}`)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button loading={checking} disabled={status.checked_today} onClick={checkin}>
            <i className={`fa-solid ${status.checked_today ? 'fa-circle-check' : 'fa-calendar-check'}`} aria-hidden="true" />
            {status.checked_today ? t('growth.checkin.checked') : t('growth.checkin.action')}
          </Button>
          <span className="text-xs text-slate-500">{t('growth.checkin.nextBonus', { days: status.next_bonus_in })}</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('growth.checkin.prevMonth')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" /></button>
          <span className="text-sm font-medium tabular-nums text-slate-700">{month}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= status.today.slice(0, 7)} aria-label={t('growth.checkin.nextMonth')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"><i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" /></button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
          {WEEKDAYS.map((w) => <span key={w}>{t(`ui.datepicker.weekday${w}`)}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((c, i) => c === null ? <span key={`e${i}`} /> : (
            <span key={c.key} aria-label={c.key}
              className={`flex aspect-square items-center justify-center rounded-md text-xs tabular-nums ${
                c.checked ? 'bg-primary-500 font-medium text-white' : c.today ? 'text-primary-700 ring-1 ring-inset ring-primary-300' : 'text-slate-500'
              }`}>
              {c.day}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}
