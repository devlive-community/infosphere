import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import AdminLayout from '@/components/AdminLayout'
import FeatureGate from '@/components/FeatureGate'
import UserAvatar from '@/components/UserAvatar'
import type { UserLite } from '@/components/UserSearchSelect'
import { api, formatDate } from '@/lib/api'
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Pagination, SegmentedTabs, Select, Switch, Textarea, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { durationLabel, formatPrice } from '@/lib/commerce'
import { CHANNEL_ICONS, STATUS_TONE, type PaymentChannel, type PaymentOrder } from '@/lib/payment'

type Tab = 'orders' | 'settings'
const TABS: Tab[] = ['orders', 'settings']
const CHANNELS: PaymentChannel[] = ['offline', 'alipay', 'wechat', 'stripe']

export default function AdminPayment() {
  return <FeatureGate feature="payment"><AdminPaymentInner /></FeatureGate>
}

function AdminPaymentInner() {
  const { t } = useTranslation()
  const router = useRouter()
  const tab: Tab = TABS.includes(router.query.tab as Tab) ? (router.query.tab as Tab) : 'orders' // tab 由 URL 驱动
  return (
    <AdminLayout current="payment" breadcrumb={t('admin.nav.payment')}>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.nav.payment')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('admin.payment.description')}</p>
      </div>
      <SegmentedTabs className="mt-6" value={tab} ariaLabel={t('admin.nav.payment')}
        items={TABS.map((key) => ({ value: key, label: t(`admin.payment.tab.${key}`), href: `/admin/payment?tab=${key}` }))} />
      <div className="mt-6">{tab === 'orders' ? <OrdersPanel /> : <SettingsPanel />}</div>
    </AdminLayout>
  )
}

// —— 订单 ——

interface OrderItem { order: PaymentOrder; user?: UserLite }

function OrdersPanel() {
  const { t, locale } = useTranslation()
  const { showToast, confirmAction } = useFeedback()
  const [q, setQ] = useState('')
  const [view, setView] = useState('') // '' | awaiting | unfulfilled | <status>
  const [channel, setChannel] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: OrderItem[]; total: number; page: number; page_size: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 正在操作的「订单号:动作」

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), page_size: '20' })
    if (q.trim()) params.set('q', q.trim())
    if (channel) params.set('channel', channel)
    if (view === 'awaiting') params.set('awaiting', '1')
    else if (view === 'unfulfilled') params.set('unfulfilled', '1')
    else if (view) params.set('status', view)
    api<{ items: OrderItem[]; total: number; page: number; page_size: number }>(`/admin/payment/orders?${params}`).then(setData)
      .catch((e) => showToast({ title: t('admin.payment.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [page, q, channel, view, showToast, t])
  useEffect(() => { load() }, [load])

  async function run(o: PaymentOrder, op: 'confirm' | 'cancel' | 'fulfill') {
    if (op !== 'fulfill') {
      const ok = await confirmAction({
        title: t(`admin.payment.op.${op}Title`), message: t(`admin.payment.op.${op}Message`, { no: o.order_no, amount: formatPrice(o.amount_cents, o.currency, locale) }),
        confirmLabel: t(`admin.payment.op.${op}`), danger: op === 'cancel',
      })
      if (!ok) return
    }
    setBusy(`${o.order_no}:${op}`)
    try {
      const r = await api<PaymentOrder>(`/admin/payment/orders/${o.order_no}/${op}`, { method: 'POST' })
      showToast({ message: t(`admin.payment.op.${op}Done`), tone: r.fulfill_error && !r.fulfilled_at ? 'error' : 'success' })
      load()
    } catch (e) { showToast({ title: t('admin.payment.opFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setBusy(null) }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="block w-full sm:w-64"><Input value={q} placeholder={t('admin.payment.search')} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></span>
        <span className="block w-44"><Select value={view} onChange={(v) => { setView(v); setPage(1) }} options={[
          { value: '', label: t('admin.payment.view.all') }, { value: 'awaiting', label: t('admin.payment.view.awaiting') },
          { value: 'unfulfilled', label: t('admin.payment.view.unfulfilled') },
          ...(['pending', 'paid', 'cancelled', 'expired'] as const).map((s) => ({ value: s, label: t(`payment.status.${s}`) })),
        ]} /></span>
        <span className="block w-40"><Select value={channel} onChange={(v) => { setChannel(v); setPage(1) }} options={[
          { value: '', label: t('admin.payment.allChannels') }, ...CHANNELS.map((c) => ({ value: c, label: t(`payment.channel.${c}`) })),
        ]} /></span>
      </div>
      {data === null ? <Loading className="py-16" /> : data.items.length === 0 ? <EmptyState>{t('admin.payment.empty')}</EmptyState> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('admin.payment.col.order')}</th><th className="px-4 py-3">{t('admin.payment.col.user')}</th>
                <th className="px-4 py-3">{t('admin.payment.col.amount')}</th><th className="px-4 py-3">{t('admin.payment.col.status')}</th>
                <th className="px-4 py-3">{t('admin.payment.col.time')}</th><th className="px-4 py-3 text-right">{t('admin.payment.col.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map(({ order: o, user }) => (
                <tr key={o.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{o.title}{o.duration_days > 0 ? ` · ${durationLabel(t, o.duration_days)}` : ''}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{o.order_no}{o.channel_trade_no ? ` · ${o.channel_trade_no}` : ''}</div>
                    {o.payer_note && <div className="mt-1 max-w-xs whitespace-pre-wrap rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{o.payer_note}</div>}
                    {o.fulfill_error && !o.fulfilled_at && <div className="mt-1 max-w-xs text-xs text-rose-600">{o.fulfill_error}</div>}
                  </td>
                  <td className="px-4 py-3">{user && <span className="flex items-center gap-2"><UserAvatar user={user} /><span className="text-slate-700">{user.nickname || user.username}</span></span>}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium tabular-nums text-slate-900">{formatPrice(o.amount_cents, o.currency, locale)}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400"><i className={CHANNEL_ICONS[o.channel]} aria-hidden="true" />{t(`payment.channel.${o.channel}`)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[o.status]}>{t(`payment.status.${o.status}`)}</Badge>
                    {o.status === 'paid' && !o.fulfilled_at && <div className="mt-1"><Badge tone="rose">{t('admin.payment.unfulfilled')}</Badge></div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    <div>{formatDate(o.created_at)}</div>
                    {o.paid_at && <div className="text-emerald-600">{t('admin.payment.paidAt', { date: formatDate(o.paid_at) })}</div>}
                  </td>
                  <td className="px-4 py-3 text-right"><span className="flex justify-end gap-2">
                    {o.channel === 'offline' && o.status !== 'paid' && <Button size="sm" loading={busy === `${o.order_no}:confirm`} onClick={() => run(o, 'confirm')}>{t('admin.payment.op.confirm')}</Button>}
                    {o.status === 'paid' && !o.fulfilled_at && <Button size="sm" variant="outline" loading={busy === `${o.order_no}:fulfill`} onClick={() => run(o, 'fulfill')}>{t('admin.payment.op.fulfill')}</Button>}
                    {(o.status === 'pending' || o.status === 'expired') && <Button size="sm" variant="ghost" className="text-rose-600" loading={busy === `${o.order_no}:cancel`} onClick={() => run(o, 'cancel')}>{t('admin.payment.op.cancel')}</Button>}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && data.total > data.page_size && <div className="mt-4"><Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></div>}
    </>
  )
}

// —— 支付方式设置 ——

type Settings = Record<string, string | number | boolean | Record<string, string> | string[]>

// 各支付方式的配置字段：secret 字段只写（已配置时留空表示不修改）。
const FIELDS: Record<PaymentChannel, { key: string; secret?: boolean; multiline?: boolean; type?: 'number' }[]> = {
  offline: [{ key: 'offline_instructions', multiline: true }, { key: 'offline_qr' }, { key: 'offline_expire_hours', type: 'number' }],
  alipay: [{ key: 'alipay_app_id' }, { key: 'alipay_private_key', secret: true, multiline: true }, { key: 'alipay_public_key', secret: true, multiline: true }],
  wechat: [{ key: 'wechat_mch_id' }, { key: 'wechat_app_id' }, { key: 'wechat_serial_no' }, { key: 'wechat_private_key', secret: true, multiline: true },
    { key: 'wechat_api_v3_key', secret: true }, { key: 'wechat_public_key_id' }, { key: 'wechat_public_key', secret: true, multiline: true }],
  stripe: [{ key: 'stripe_secret_key', secret: true }, { key: 'stripe_webhook_secret', secret: true }],
}

function SettingsPanel() {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Settings>({})
  const [saving, setSaving] = useState<PaymentChannel | null>(null)

  useEffect(() => {
    api<Settings>('/admin/payment/settings').then(setSettings)
      .catch((e) => showToast({ title: t('admin.payment.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [showToast, t])

  const value = (key: string) => (key in draft ? draft[key] : settings?.[key])
  const set = (key: string, v: string | number | boolean) => setDraft((d) => ({ ...d, [key]: v }))

  // 按支付方式分别保存：只提交该方式下改动过的字段
  async function save(ch: PaymentChannel) {
    const keys = [`${ch}_enabled`, ...FIELDS[ch].map((f) => f.key), ...(ch === 'alipay' ? ['alipay_sandbox'] : [])]
    const body = Object.fromEntries(keys.filter((k) => k in draft).map((k) => [k, draft[k]]))
    setSaving(ch)
    try {
      const next = await api<Settings>('/admin/payment/settings', { method: 'PUT', body })
      setSettings(next)
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !keys.includes(k))))
      showToast({ message: t('admin.payment.settings.saved'), tone: 'success' })
    } catch (e) { showToast({ title: t('admin.payment.settings.saveFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setSaving(null) }
  }

  if (!settings) return <Loading className="py-16" />
  const available = (settings.available as string[]) || []
  const notifyURLs = (settings.notify_urls as Record<string, string>) || {}
  return (
    <div className="max-w-3xl space-y-6">
      {!settings.site_url_set && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('admin.payment.settings.siteUrlHint')}</div>}
      {CHANNELS.map((ch) => (
        <Card key={ch} className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <i className={`${CHANNEL_ICONS[ch]} w-6 text-center text-xl text-slate-600`} aria-hidden="true" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{t(`payment.channel.${ch}`)}</span>
                  <Badge tone={available.includes(ch) ? 'emerald' : 'slate'}>{available.includes(ch) ? t('admin.payment.settings.ready') : t('admin.payment.settings.notReady')}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{t(`admin.payment.settings.${ch}Hint`)}</p>
              </div>
            </div>
            <Switch ariaLabel={t(`payment.channel.${ch}`)} checked={Boolean(value(`${ch}_enabled`))} onChange={(on) => set(`${ch}_enabled`, on)} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {FIELDS[ch].map((f) => {
              const isSet = f.secret && Boolean(settings[`${f.key}_set`])
              const placeholder = f.secret ? (isSet ? t('admin.payment.settings.secretSet') : t('admin.payment.settings.secretEmpty')) : ''
              const v = f.secret ? String(draft[f.key] ?? '') : String(value(f.key) ?? '')
              return (
                <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
                  <Field label={t(`admin.payment.field.${f.key}`)}>
                    {f.multiline
                      ? <Textarea rows={f.secret ? 4 : 5} value={v} placeholder={placeholder} spellCheck={false} onChange={(e) => set(f.key, e.target.value)} className={f.secret ? 'font-mono text-xs' : ''} />
                      : <Input type={f.type === 'number' ? 'number' : f.secret ? 'password' : 'text'} value={v} placeholder={placeholder} autoComplete="off"
                        onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) || 0 : e.target.value)} />}
                  </Field>
                </div>
              )
            })}
            {ch === 'alipay' && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Switch ariaLabel={t('admin.payment.field.alipay_sandbox')} checked={Boolean(value('alipay_sandbox'))} onChange={(on) => set('alipay_sandbox', on)} />
                {t('admin.payment.field.alipay_sandbox')}
              </label>
            )}
          </div>
          {notifyURLs[ch] && (
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {t('admin.payment.settings.notifyUrl')}<code className="ml-1 break-all text-slate-700">{notifyURLs[ch]}</code>
            </div>
          )}
          <div className="mt-5 flex justify-end"><Button loading={saving === ch} onClick={() => save(ch)}>{t('common.actions.save')}</Button></div>
        </Card>
      ))}
    </div>
  )
}
