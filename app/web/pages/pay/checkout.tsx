import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Container from '@/components/Container'
import FeatureGate from '@/components/FeatureGate'
import Seo from '@/components/Seo'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Button, Card, EmptyState, Loading, useFeedback } from '@/components/ui'
import { durationLabel, formatPrice } from '@/lib/membership'
import { CHANNEL_ICONS, isMobileDevice, type PaymentAction, type PaymentChannel, type PaymentOrder, type PaymentProduct } from '@/lib/payment'

export default function CheckoutPage() {
  return <FeatureGate feature="payment"><CheckoutInner /></FeatureGate>
}

// 结算页：展示商品与可用支付方式，下单后按渠道动作跳转收银台或进入订单页（扫码/线下转账）。
function CheckoutInner() {
  const user = useRequireAuth()
  const router = useRouter()
  const { site } = useApp()
  const { t, locale } = useTranslation()
  const { showToast } = useFeedback()
  const kind = typeof router.query.kind === 'string' ? router.query.kind : ''
  const sku = typeof router.query.sku === 'string' ? router.query.sku : ''
  const [data, setData] = useState<{ product: PaymentProduct; channels: PaymentChannel[] } | null>(null)
  const [error, setError] = useState('')
  const [channel, setChannel] = useState<PaymentChannel | ''>('')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!user || !kind || !sku) return
    api<{ product: PaymentProduct; channels: PaymentChannel[] }>(`/payment/products/${encodeURIComponent(kind)}/${encodeURIComponent(sku)}`)
      .then((r) => { setData(r); setChannel(r.channels[0] || '') })
      .catch((e) => setError((e as Error).message))
  }, [user, kind, sku])

  async function pay() {
    if (!channel) return
    setPaying(true)
    try {
      const r = await api<{ order: PaymentOrder; action: PaymentAction }>('/payment/orders', { method: 'POST', body: { kind, sku, channel, mobile: isMobileDevice() } })
      if (r.action.type === 'redirect' && r.action.url) { window.location.href = r.action.url; return }
      router.push(`/pay/orders/${r.order.order_no}`)
    } catch (e) {
      showToast({ title: t('payment.createFailed'), message: (e as Error).message, tone: 'error' })
      setPaying(false)
    }
  }

  if (!user || (!data && !error)) return <Loading className="min-h-[60vh]" />
  return (
    <>
      <Seo siteName={site.site_name || 'KnowForge'} title={t('payment.checkout.title')} noindex />
      <Container>
        <div className="mx-auto max-w-xl py-10">
          <h1 className="text-2xl font-bold text-ink">{t('payment.checkout.title')}</h1>
          {error || !data ? <div className="mt-6"><EmptyState>{error}</EmptyState></div> : (
            <>
              <Card className="mt-6 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-slate-900">{data.product.title}</div>
                    {data.product.duration_days ? <div className="mt-1 text-sm text-slate-500">{durationLabel(t, data.product.duration_days)}</div> : null}
                    {data.product.description && <p className="mt-2 text-xs leading-5 text-slate-500">{data.product.description}</p>}
                  </div>
                  <div className="shrink-0 text-2xl font-bold tabular-nums text-slate-900">{formatPrice(data.product.amount_cents, data.product.currency, locale)}</div>
                </div>
              </Card>

              <h2 className="mt-8 font-bold text-slate-900">{t('payment.checkout.method')}</h2>
              {data.channels.length === 0 ? <div className="mt-3"><EmptyState>{t('payment.checkout.noChannels')}</EmptyState></div> : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('payment.checkout.method')}>
                  {data.channels.map((ch) => (
                    <button key={ch} type="button" role="radio" aria-checked={channel === ch} onClick={() => setChannel(ch)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${channel === ch ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <i className={`${CHANNEL_ICONS[ch]} w-6 text-center text-xl text-slate-600`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">{t(`payment.channel.${ch}`)}</span>
                        <span className="block text-xs text-slate-400">{t(`payment.channelHint.${ch}`)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <Button className="mt-6 w-full" loading={paying} disabled={!channel} onClick={pay}>
                {t('payment.checkout.pay', { amount: formatPrice(data.product.amount_cents, data.product.currency, locale) })}
              </Button>
            </>
          )}
        </div>
      </Container>
    </>
  )
}
