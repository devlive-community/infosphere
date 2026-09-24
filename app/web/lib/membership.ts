import type { ResourceTranslations } from '@/components/LocalizedFields'

type TFn = (key: string, vars?: Record<string, string | number>) => string

/** 会员方案的一档时长价格（金额为最小货币单位，如分） */
export interface MembershipPrice {
  id: number
  plan_id: number
  duration_days: number
  price_cents: number
  original_price_cents: number
}

export interface MembershipPlan {
  id: number
  name: string
  description: string
  icon_type?: string
  icon_value?: string
  color?: string
  entitlements?: Record<string, number> | null
  status: 'active' | 'archived'
  sort_order: number
  prices: MembershipPrice[]
  translations?: ResourceTranslations
}

export interface MembershipRecord {
  id: number
  user_id: number
  plan_id: number
  plan_name: string
  action: 'grant' | 'extend' | 'switch' | 'adjust' | 'revoke'
  days: number
  prev_expires_at?: string | null
  expires_at?: string | null
  source: string
  source_ref?: string
  reason?: string
  created_at: string
}

/** 我的会员（含最近一次已到期的） */
export interface MyMembership {
  plan: MembershipPlan | null
  started_at: string
  expires_at: string
  active: boolean
  days_left: number
}

// formatPrice 按货币与界面语言格式化金额（cents → 货币单位）。
export function formatPrice(cents: number, currency: string, locale?: string): string {
  const amount = cents / 100
  try {
    return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// durationLabel 时长文案：整年/整月按年/月展示，其余按天（30 天 = 1 个月、365 天 = 1 年）。
export function durationLabel(t: TFn, days: number): string {
  if (days % 365 === 0) return t('membership.duration.years', { n: days / 365 })
  if (days % 30 === 0) return t('membership.duration.months', { n: days / 30 })
  return t('membership.duration.days', { n: days })
}

// centsFromInput / inputFromCents 价格输入框（货币单位，两位小数）与分之间的换算。
export function centsFromInput(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
export function inputFromCents(cents: number): string {
  return cents ? (cents / 100).toFixed(2).replace(/\.00$/, '') : ''
}
