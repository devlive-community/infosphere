/** 支付订单（与服务端 payment.Order 一致） */
export interface PaymentOrder {
  id: number
  order_no: string
  user_id: number
  kind: string
  sku: string
  title: string
  duration_days: number
  amount_cents: number
  currency: string
  return_link: string
  channel: PaymentChannel
  status: 'pending' | 'paid' | 'cancelled' | 'expired'
  channel_trade_no: string
  payer_note: string
  proof_at?: string | null
  expires_at: string
  paid_at?: string | null
  fulfilled_at?: string | null
  fulfill_error: string
  created_at: string
}

export type PaymentChannel = 'offline' | 'alipay' | 'wechat' | 'stripe'

/** 下单/继续支付时前端要执行的动作 */
export interface PaymentAction {
  type: 'redirect' | 'qrcode' | 'offline'
  url?: string
  qr?: string
  instructions?: string
  qr_image?: string
}

/** 可售商品（plugincore.Product） */
export interface PaymentProduct {
  kind: string
  sku: string
  title: string
  description?: string
  duration_days?: number
  amount_cents: number
  currency: string
  return_link?: string
}

export const CHANNEL_ICONS: Record<PaymentChannel, string> = {
  offline: 'fa-solid fa-building-columns',
  alipay: 'fa-brands fa-alipay',
  wechat: 'fa-brands fa-weixin',
  stripe: 'fa-brands fa-stripe',
}

export const STATUS_TONE: Record<PaymentOrder['status'], 'amber' | 'emerald' | 'slate' | 'rose'> = {
  pending: 'amber', paid: 'emerald', cancelled: 'slate', expired: 'slate',
}

// isMobileDevice 移动端浏览器（支付宝走手机网站支付）。
export function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
}

// checkoutHref 商品的结算页地址（由商品所属插件的页面链接过来）。
export function checkoutHref(kind: string, sku: string | number): string {
  return `/pay/checkout?kind=${encodeURIComponent(kind)}&sku=${encodeURIComponent(String(sku))}`
}
