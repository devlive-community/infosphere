import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Container from '@/components/Container'
import FeatureGate from '@/components/FeatureGate'
import Seo from '@/components/Seo'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Loading, Textarea, useFeedback } from '@/components/ui'
import { durationLabel, formatPrice } from '@/lib/membership'
import { checkoutHref, isMobileDevice, STATUS_TONE, type PaymentAction, type PaymentOrder } from '@/lib/payment'

const POLL_MS = 3000
const POLL_LIMIT_MS = 15 * 60 * 1000

// 订单页：待支付时展示扫码/继续支付/线下转账说明并轮询状态（服务端会向渠道主动查询兜底），支付成功后引导返回。
export default function PaymentOrderPage() {
  return <FeatureGate feature="payment"><PaymentOrderInner /></FeatureGate>
}

function PaymentOrderInner() {
  const user = useRequireAuth()
  const router = useRouter()
  const { site } = useApp()
  const { t, locale } = useTranslation()
  const { showToast, confirmAction } = useFeedback()
  const no = typeof router.query.no === 'string' ? router.query.no : ''
  const [data, setData] = useState<{ order: PaymentOrder; action?: PaymentAction } | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const started = useRef(Date.now())

  const load = useCallback(() => {
    if (!no) return Promise.resolve()
    return api<{ order: PaymentOrder; action?: PaymentAction }>(`/payment/orders/${encodeURIComponent(no)}${isMobileDevice() ? '?mobile=1' : ''}`)
      .then((r) => { setData(r); setError('') })
      .catch((e) => setError((e as Error).message))
  }, [no])

  useEffect(() => { if (user) load() }, [user, load])

  // 待支付的在线订单轮询状态（线下转账等待人工确认，不轮询）
  const pending = data?.order.status === 'pending'
  const online = data && data.order.channel !== 'offline'
  useEffect(() => {
    if (!pending || !online) return
    const timer = window.setInterval(() => {
      if (Date.now() - started.current > POLL_LIMIT_MS) { window.clearInterval(timer); return }
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [pending, online, load])

  async function submitProof() {
    if (!note.trim()) return
    setSubmitting(true)
    try {
      await api(`/payment/orders/${encodeURIComponent(no)}/proof`, { method: 'POST', body: { note: note.trim() } })
      showToast({ message: t('payment.order.proofSubmitted'), tone: 'success' })
      setNote('')
      await load()
    } catch (e) { showToast({ title: t('payment.order.proofFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setSubmitting(false) }
  }

  async function cancel() {
    if (!(await confirmAction({ title: t('payment.order.cancelTitle'), message: t('payment.order.cancelMessage'), confirmLabel: t('payment.order.cancel'), danger: true }))) return
    setCancelling(true)
    try { await api(`/payment/orders/${encodeURIComponent(no)}/cancel`, { method: 'POST' }); await load() }
    catch (e) { showToast({ title: t('payment.order.cancelFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setCancelling(false) }
  }

  if (!user || (!data && !error)) return <Loading className="min-h-[60vh]" />
  const o = data?.order
  const act = data?.action
  return (
    <>
      <Seo siteName={site.site_name || 'KnowForge'} title={t('payment.order.title')} noindex />
      <Container>
        <div className="mx-auto max-w-xl py-10">
          {!o ? <EmptyState>{error}</EmptyState> : (
            <>
              <Card className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">{o.title}</span>
                      <Badge tone={STATUS_TONE[o.status]}>{t(`payment.status.${o.status}`)}</Badge>
                    </div>
                    {o.duration_days > 0 && <div className="mt-1 text-sm text-slate-500">{durationLabel(t, o.duration_days)}</div>}
                    <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                      <div>{t('payment.order.no')}：{o.order_no}</div>
                      <div>{t(`payment.channel.${o.channel}`)} · {formatDate(o.created_at)}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-2xl font-bold tabular-nums text-slate-900">{formatPrice(o.amount_cents, o.currency, locale)}</div>
                </div>
              </Card>

              {o.status === 'paid' && (
                <Card className="mt-4 flex flex-col items-center gap-3 p-8 text-center">
                  <i className="fa-solid fa-circle-check text-5xl text-emerald-500" aria-hidden="true" />
                  <div className="text-lg font-bold text-slate-900">{t('payment.order.paidTitle')}</div>
                  <p className="text-sm text-slate-500">{o.fulfilled_at ? t('payment.order.fulfilled') : t('payment.order.fulfilling')}</p>
                  {o.return_link && <ButtonLink href={o.return_link}>{t('payment.order.back')}</ButtonLink>}
                </Card>
              )}

              {pending && act?.type === 'qrcode' && act.qr && (
                <Card className="mt-4 flex flex-col items-center gap-3 p-8 text-center">
                  <img src={act.qr} alt={t('payment.order.qrAlt')} className="h-56 w-56 rounded-lg border border-slate-100" />
                  <p className="text-sm text-slate-600">{t('payment.order.scanWechat')}</p>
                  <p className="text-xs text-slate-400">{t('payment.order.waiting', { date: formatDate(o.expires_at) })}</p>
                </Card>
              )}

              {pending && act?.type === 'redirect' && act.url && (
                <Card className="mt-4 flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm text-slate-600">{t('payment.order.redirectHint')}</p>
                  <Button onClick={() => { window.location.href = act.url! }}>{t('payment.order.continue')}</Button>
                  <p className="text-xs text-slate-400">{t('payment.order.waiting', { date: formatDate(o.expires_at) })}</p>
                </Card>
              )}

              {pending && act?.type === 'offline' && (
                <Card className="mt-4 space-y-4 p-6">
                  <div>
                    <h2 className="font-bold text-slate-900">{t('payment.order.offlineTitle')}</h2>
                    <p className="mt-1 text-xs text-slate-400">{t('payment.order.offlineHint', { amount: formatPrice(o.amount_cents, o.currency, locale), no: o.order_no, date: formatDate(o.expires_at) })}</p>
                  </div>
                  {act.instructions && <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{act.instructions}</div>}
                  {act.qr_image && <img src={act.qr_image} alt={t('payment.order.qrAlt')} className="mx-auto h-56 w-56 rounded-lg border border-slate-100 object-contain" />}
                  {o.proof_at ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      {t('payment.order.proofWaiting', { date: formatDate(o.proof_at) })}
                      <div className="mt-1 whitespace-pre-wrap text-xs text-amber-700">{o.payer_note}</div>
                    </div>
                  ) : (
                    <>
                      <Field label={t('payment.order.proofLabel')} hint={t('payment.order.proofHint')}>
                        <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                      </Field>
                      <div className="flex justify-end"><Button loading={submitting} disabled={!note.trim()} onClick={submitProof}>{t('payment.order.proofSubmit')}</Button></div>
                    </>
                  )}
                </Card>
              )}

              {(o.status === 'expired' || o.status === 'cancelled') && (
                <Card className="mt-4 flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm text-slate-500">{t(o.status === 'expired' ? 'payment.order.expiredHint' : 'payment.order.cancelledHint')}</p>
                  <ButtonLink href={checkoutHref(o.kind, o.sku)} variant="outline">{t('payment.order.reorder')}</ButtonLink>
                </Card>
              )}

              <div className="mt-4 flex items-center justify-between">
                <ButtonLink href="/user/orders" variant="ghost">{t('payment.order.myOrders')}</ButtonLink>
                {pending && <Button variant="ghost" className="text-rose-600" loading={cancelling} onClick={cancel}>{t('payment.order.cancel')}</Button>}
              </div>
            </>
          )}
        </div>
      </Container>
    </>
  )
}
