import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Badge, Card } from '@/components/ui'
import { entitlementLabel, formatEntitlement, type EntitlementDef, type ResolvedEntitlement } from '@/lib/entitlements'
import type { MyAIUsage } from '@/lib/ai-usage'

const METERED: Record<string, (u: MyAIUsage) => number> = {
  'ai.monthly_tokens': (u) => u.used_tokens,
  'translate.monthly_chars': (u) => u.translate_chars,
}

const sourceTone: Record<string, 'slate' | 'primary' | 'amber' | 'emerald'> = { base: 'slate', level: 'primary', membership: 'amber', admin: 'emerald' }

// MyEntitlementsCard 「我的权益」：各项权益的当前生效值与来源（基础 / 等级 / 会员 / 管理员）；不可用的项不显示。
export default function MyEntitlementsCard({ reloadKey }: { reloadKey?: number }) {
  const { t } = useTranslation()
  const [data, setData] = useState<{ items: ResolvedEntitlement[]; definitions: EntitlementDef[] } | null>(null)
  const [usage, setUsage] = useState<MyAIUsage | null>(null)
  useEffect(() => {
    api<{ items: ResolvedEntitlement[]; definitions: EntitlementDef[] }>('/users/me/entitlements').then((d) => {
      setData(d)
      // 按月计量的权益（AI tokens、翻译字数）同时展示本月已用
      if (d.items.some((r) => METERED[r.key] && r.source !== 'unavailable')) api<MyAIUsage>('/users/me/ai-usage').then(setUsage).catch(() => { /* 忽略 */ })
    }).catch(() => { /* 忽略 */ })
  }, [reloadKey])
  if (!data) return null
  const defs = new Map(data.definitions.map((d) => [d.key, d]))
  const items = data.items.filter((r) => r.source !== 'unavailable')
  if (items.length === 0) return null
  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-slate-900">{t('entitlement.mine.title')}</h2>
        {usage && <Link href="/user/ai-usage" className="ml-auto text-xs font-medium text-primary-600 hover:text-primary-700">{t('entitlement.mine.viewAIUsage')}</Link>}
      </div>
      <p className="mt-1 text-xs text-slate-400">{t('entitlement.mine.hint')}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm text-slate-700">{entitlementLabel(t, r.key)}</span>
              {usage && METERED[r.key] && <span className="block text-xs tabular-nums text-slate-400">{t('entitlement.mine.usedThisMonth', { n: METERED[r.key](usage).toLocaleString() })}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium tabular-nums text-slate-900">{formatEntitlement(t, defs.get(r.key), r.value)}</span>
              <Badge tone={sourceTone[r.source] || 'slate'}>{t(`entitlement.source.${r.source}`)}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
