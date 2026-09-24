import type { SiteConfig } from '@/lib/types'

// 商品与结算的中性约定（对应服务端 plugincore/commerce.go）：售卖商品的插件（如会员）与提供结算的插件（如支付）
// 都只依赖本文件，互不引用。
//   - 是否可在线购买：公开站点配置 checkout_enabled（由提供结算的插件下发）；
//   - 结算入口：/pay/checkout?kind=&sku=（由提供结算的插件实现该页面）。

type TFn = (key: string, vars?: Record<string, string | number>) => string

// checkoutAvailable 当前是否可以在线购买（有插件提供了可用的结算方式）。
export function checkoutAvailable(site: SiteConfig): boolean {
  return site.checkout_enabled === true
}

// checkoutHref 商品的结算页地址。
export function checkoutHref(kind: string, sku: string | number): string {
  return `/pay/checkout?kind=${encodeURIComponent(kind)}&sku=${encodeURIComponent(String(sku))}`
}

// formatPrice 按货币与界面语言格式化金额（最小货币单位 → 货币单位）。
export function formatPrice(cents: number, currency: string, locale?: string): string {
  const amount = cents / 100
  try {
    return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// durationLabel 限时商品的时长文案：整年/整月按年/月展示，其余按天（30 天 = 1 个月、365 天 = 1 年）。
export function durationLabel(t: TFn, days: number): string {
  if (days % 365 === 0) return t('commerce.duration.years', { n: days / 365 })
  if (days % 30 === 0) return t('commerce.duration.months', { n: days / 30 })
  return t('commerce.duration.days', { n: days })
}
