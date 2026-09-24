import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import AchievementIcon from '@/components/AchievementIcon'
import { Badge, Button, Checkbox, EmptyState, Loading, Modal, useFeedback } from '@/components/ui'

interface Preset {
  key: string
  category: string
  series_key: string
  tier: number
  rarity: string
  icon_value: string
  reward_xp: number
  metric_key: string
  target_value: number
  name: Record<string, string>
  description: Record<string, string>
  installed: boolean
}

const CATEGORY_ORDER = ['reading', 'creation', 'community', 'account', 'special']
const rarityTone: Record<string, 'slate' | 'sky' | 'violet' | 'amber'> = { common: 'slate', rare: 'sky', epic: 'violet', legendary: 'amber' }

// AchievementPresetsModal 后台「预设成就」：列出代码内置的预设及安装状态，勾选未安装的预设一键安装（安装后即为普通成就，可编辑/停用）。
export default function AchievementPresetsModal({ open, onClose, onInstalled, showReward }: {
  open: boolean
  onClose: () => void
  onInstalled: () => void
  showReward: boolean
}) {
  const { t, locale } = useTranslation()
  const { showToast } = useFeedback()
  const [items, setItems] = useState<Preset[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState(false)

  async function load() {
    const r = await api<{ items: Preset[] }>('/admin/achievement-presets')
    setItems(r.items || [])
    setSelected(new Set((r.items || []).filter((p) => !p.installed).map((p) => p.key))) // 默认勾选全部未安装
  }
  useEffect(() => {
    if (!open) return
    setItems(null)
    load().catch((e) => showToast({ title: t('admin.achievements.presets.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (m: Record<string, string>) => m[locale] || m[locale.split('-')[0]] || m['zh-CN'] || Object.values(m)[0] || ''
  const pending = (items || []).filter((p) => !p.installed)
  const groups = useMemo(() => CATEGORY_ORDER
    .map((category) => ({ category, list: (items || []).filter((p) => p.category === category) }))
    .filter((g) => g.list.length > 0), [items])

  function toggle(key: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  async function install() {
    setInstalling(true)
    try {
      const r = await api<{ installed: number }>('/admin/achievement-presets/install', { method: 'POST', body: { keys: Array.from(selected) } })
      showToast({ message: t('admin.achievements.presets.installed', { count: r.installed }), tone: 'success' })
      await load()
      onInstalled()
    } catch (e) {
      showToast({ title: t('admin.achievements.presets.installFailed'), message: (e as Error).message, tone: 'error' })
    } finally { setInstalling(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('admin.achievements.presets.title')} className="max-w-3xl"
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.actions.cancel')}</Button>
        <Button loading={installing} disabled={selected.size === 0} onClick={install}>{t('admin.achievements.presets.install', { count: selected.size })}</Button>
      </>}>
      {!items ? <Loading className="py-12" /> : items.length === 0 ? <EmptyState>{t('admin.achievements.presets.empty')}</EmptyState> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>{t('admin.achievements.presets.summary', { total: items.length, installed: items.length - pending.length })}</span>
            {pending.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={selected.size === pending.length} ariaLabel={t('admin.achievements.presets.selectAll')}
                  onChange={(on) => setSelected(on ? new Set(pending.map((p) => p.key)) : new Set())} />
                {t('admin.achievements.presets.selectAll')}
              </label>
            )}
          </div>
          <p className="text-xs text-slate-400">{t('admin.achievements.presets.hint')}</p>
          {groups.map((g) => (
            <section key={g.category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t(`admin.achievements.category.${g.category}`)}</h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {g.list.map((p) => (
                  <li key={p.key} className={`flex items-center gap-3 px-3 py-2.5 ${p.installed ? 'bg-slate-50/60' : ''}`}>
                    <Checkbox checked={p.installed || selected.has(p.key)} disabled={p.installed} ariaLabel={pick(p.name)} onChange={(on) => toggle(p.key, on)} />
                    <AchievementIcon achievement={{ name: pick(p.name), icon_type: 'fa', icon_value: p.icon_value }} size="sm" muted={p.installed} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-800">{pick(p.name)}</span>
                        <Badge tone={rarityTone[p.rarity] || 'slate'}>{t(`admin.achievements.rarity.${p.rarity}`)}</Badge>
                        {p.installed && <Badge tone="emerald">{t('admin.achievements.presets.installedBadge')}</Badge>}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{pick(p.description)}</span>
                    </span>
                    {showReward && p.reward_xp > 0 && <span className="shrink-0 text-xs font-medium tabular-nums text-emerald-600">+{p.reward_xp} XP</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  )
}
