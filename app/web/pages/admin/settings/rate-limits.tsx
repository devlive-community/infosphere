import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Switch, Loading, Badge, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface Policy {
  name: string
  limit: number
  window_seconds: number
  default_limit: number
  default_window: number
  by_user: boolean
}

// 系统设置 · 限流：内置各限流策略的上限/窗口可调，含全局开关（仅管理员）。
export default function SettingsRateLimits() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [enabled, setEnabled] = useState(true)
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    api<{ enabled: boolean; policies: Policy[] }>('/rate-limits')
      .then((d) => { setEnabled(d.enabled); setPolicies(d.policies || []) })
      .catch((e) => showToast({ title: t('admin.settings.rateLimit.loadFailed'), message: (e as Error).message, tone: 'error' }))
      .finally(() => setLoading(false))
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  function patch(name: string, changes: Partial<Policy>) {
    setPolicies((list) => list.map((p) => (p.name === name ? { ...p, ...changes } : p)))
  }

  async function save() {
    setSaving(true)
    try {
      const d = await api<{ enabled: boolean; policies: Policy[] }>('/rate-limits', {
        method: 'PUT',
        body: { enabled, policies: policies.map((p) => ({ name: p.name, limit: p.limit, window_seconds: p.window_seconds })) },
      })
      setEnabled(d.enabled); setPolicies(d.policies || [])
      showToast({ message: t('admin.settings.rateLimit.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('admin.settings.rateLimit.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const policyLabel = (name: string) => {
    const key = `admin.settings.rateLimit.policy.${name.replace(/-/g, '_')}`
    const v = t(key)
    return v === key ? name : v
  }

  return (
    <SettingsLayout active="rate-limits" description={t('admin.settings.rateLimit.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.rateLimit.loading')} /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-sm font-medium text-slate-900">{t('admin.settings.rateLimit.enable')}</div>
            <p className="mt-1 text-xs text-slate-400">{t('admin.settings.rateLimit.enableHint')}</p>
          </div>
          <Switch ariaLabel={t('admin.settings.rateLimit.enable')} checked={enabled} onChange={setEnabled} />
        </div>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-[1fr_5rem_6rem] items-center gap-3 px-1 text-xs text-slate-400">
            <span>{t('admin.settings.rateLimit.col.policy')}</span>
            <span>{t('admin.settings.rateLimit.col.limit')}</span>
            <span>{t('admin.settings.rateLimit.col.window')}</span>
          </div>
          {policies.map((p) => (
            <div key={p.name} className={`grid grid-cols-[1fr_5rem_6rem] items-center gap-3 ${enabled ? '' : 'opacity-50'}`}>
              <div className="min-w-0">
                <span className="block truncate text-sm text-slate-800">{policyLabel(p.name)}</span>
                <span className="text-xs text-slate-400">{p.by_user ? t('admin.settings.rateLimit.byUser') : t('admin.settings.rateLimit.byIp')} · {t('admin.settings.rateLimit.default', { limit: p.default_limit, window: p.default_window })}</span>
              </div>
              <Input type="number" min={1} value={p.limit} disabled={!enabled}
                onChange={(e) => patch(p.name, { limit: Math.max(1, Number(e.target.value) || 1) })} />
              <Input type="number" min={1} value={p.window_seconds} disabled={!enabled}
                onChange={(e) => patch(p.name, { window_seconds: Math.max(1, Number(e.target.value) || 1) })} trailing={<span className="text-xs text-slate-400">s</span>} />
            </div>
          ))}
        </div>

        {!enabled && <div className="mt-4"><Badge tone="amber">{t('admin.settings.rateLimit.disabledNote')}</Badge></div>}
        <div className="mt-6 flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.rateLimit.save')}</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
