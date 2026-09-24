import { useEffect, useState } from 'react'
import Container from '@/components/Container'
import FeatureGate from '@/components/FeatureGate'
import ResourceIcon from '@/components/ResourceIcon'
import MyEntitlementsCard from '@/components/MyEntitlementsCard'
import Seo from '@/components/Seo'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Badge, Card, EmptyState, Loading } from '@/components/ui'
import { entitlementLabel, formatEntitlement, type EntitlementDef } from '@/lib/entitlements'
import { durationLabel, formatPrice, type MembershipPlan, type MembershipRecord, type MyMembership } from '@/lib/membership'

export default function MyMembershipPage() {
  return <FeatureGate feature="membership"><MyMembershipInner /></FeatureGate>
}

// PlanEntitlements 方案包含的权益（只列方案配置了的项）。
function PlanEntitlements({ plan, defs }: { plan: MembershipPlan; defs: EntitlementDef[] }) {
  const { t } = useTranslation()
  const items = defs.filter((d) => plan.entitlements && plan.entitlements[d.key] !== undefined)
  if (items.length === 0) return null
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {items.map((d) => (
        <li key={d.key} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-slate-600"><i className="fa-solid fa-check text-xs text-emerald-500" aria-hidden="true" /><span className="truncate">{entitlementLabel(t, d.key)}</span></span>
          <span className="shrink-0 font-medium tabular-nums text-slate-900">{formatEntitlement(t, d, plan.entitlements![d.key])}</span>
        </li>
      ))}
    </ul>
  )
}

function MyMembershipInner() {
  const user = useRequireAuth()
  const { site } = useApp()
  const { t, locale } = useTranslation()
  const siteName = site.site_name || 'KnowForge'
  const [mine, setMine] = useState<{ membership: MyMembership | null; records: MembershipRecord[]; currency: string } | null>(null)
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [defs, setDefs] = useState<EntitlementDef[]>([])

  useEffect(() => {
    if (!user) return
    api<{ membership: MyMembership | null; records: MembershipRecord[]; currency: string }>('/users/me/membership').then(setMine).catch(() => {})
    api<{ items: MembershipPlan[] }>('/membership/plans').then((r) => setPlans(r.items || [])).catch(() => {})
    api<{ items: EntitlementDef[] }>('/entitlements/definitions').then((r) => setDefs(r.items || [])).catch(() => {})
  }, [user])

  if (!user || !mine) return <Loading className="min-h-[60vh]" />
  const m = mine.membership
  const currentPlanID = m?.active ? m.plan?.id : undefined

  return (
    <>
      <Seo siteName={siteName} title={t('membership.seoTitle')} noindex />
      <Container>
        <div className="py-8">
          <h1 className="text-2xl font-bold text-ink">{t('membership.heading')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('membership.subtitle')}</p>

          {/* 当前会员 */}
          <Card className="mt-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <ResourceIcon iconType={m?.plan?.icon_type} iconValue={m?.plan?.icon_value} fallback="fa-crown"
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border text-3xl ${m?.active ? 'border-amber-100 bg-amber-50 text-amber-500' : 'border-slate-100 bg-slate-50 text-slate-300'}`} />
            <div className="min-w-0 flex-1">
              {m && m.plan ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xl font-bold text-slate-900">{m.plan.name}</span>
                    <Badge tone={m.active ? 'amber' : 'slate'}>{m.active ? t('membership.active') : t('membership.expired')}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {m.active ? t('membership.expiresOn', { date: formatDate(m.expires_at), days: m.days_left }) : t('membership.expiredOn', { date: formatDate(m.expires_at) })}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold text-slate-900">{t('membership.none')}</div>
                  <p className="mt-1.5 text-sm text-slate-500">{t('membership.noneHint')}</p>
                </>
              )}
            </div>
          </Card>

          {/* 可开通的方案 */}
          <h2 className="mt-8 font-bold text-slate-900">{t('membership.plans')}</h2>
          <p className="mt-1 text-xs text-slate-400">{t('membership.plansHint')}</p>
          {plans.length === 0 ? <div className="mt-3"><EmptyState>{t('membership.noPlans')}</EmptyState></div> : (
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((p) => (
                <Card key={p.id} className={`flex flex-col p-5 ${currentPlanID === p.id ? 'ring-2 ring-amber-300' : ''}`}>
                  <div className="flex items-center gap-3">
                    <ResourceIcon iconType={p.icon_type} iconValue={p.icon_value} fallback="fa-crown" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate font-bold text-slate-900">{p.name}</span>{currentPlanID === p.id && <Badge tone="amber">{t('membership.current')}</Badge>}</div>
                      {p.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.description}</p>}
                    </div>
                  </div>
                  <PlanEntitlements plan={p} defs={defs} />
                  {p.prices.length > 0 && (
                    <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
                      {p.prices.map((pr) => (
                        <div key={pr.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-slate-600">{durationLabel(t, pr.duration_days)}</span>
                          <span className="flex items-baseline gap-2">
                            {pr.original_price_cents > pr.price_cents && <span className="text-xs text-slate-400 line-through">{formatPrice(pr.original_price_cents, mine.currency, locale)}</span>}
                            <span className="font-bold tabular-nums text-slate-900">{formatPrice(pr.price_cents, mine.currency, locale)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          <MyEntitlementsCard />

          {/* 会员记录 */}
          {mine.records.length > 0 && (
            <Card className="mt-6 p-5">
              <h2 className="font-bold text-slate-900">{t('membership.records')}</h2>
              <ul className="mt-3 divide-y divide-slate-100">
                {mine.records.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge tone={r.action === 'revoke' ? 'rose' : 'amber'}>{t(`membership.action.${r.action}`)}</Badge>
                      <span className="truncate text-slate-700">{r.plan_name}{r.days > 0 ? ` · ${durationLabel(t, r.days)}` : ''}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(r.created_at)}{r.expires_at ? ` · ${t('membership.until', { date: formatDate(r.expires_at) })}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </Container>
    </>
  )
}
