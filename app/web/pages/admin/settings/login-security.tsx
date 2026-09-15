import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Input, Switch, Select, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface LoginSecurity {
  lockout_enabled: boolean
  lockout_threshold: number
  lockout_window: number
  lockout_duration: number
  password_min_length: number
  password_require_mixed: boolean
  account_deletion_cooldown_days: number
}

// 系统设置 · 登录安全：登录失败锁定 + 密码策略（仅管理员）
export default function SettingsLoginSecurity() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<LoginSecurity>({
    lockout_enabled: false, lockout_threshold: 5, lockout_window: 15, lockout_duration: 15,
    password_min_length: 6, password_require_mixed: false, account_deletion_cooldown_days: 7,
  })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<LoginSecurity>('/login-security').then(setCfg).catch((e) => setMessage((e as Error).message)).finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await api<LoginSecurity>('/login-security', { method: 'PUT', body: cfg })
      setCfg(saved)
      setMessage(t('admin.settings.loginSecurity.saved'))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const numOptions = (values: number[], suffix: string) => values.map((n) => ({ value: String(n), label: `${n} ${suffix}` }))

  return (
    <SettingsLayout active="login-security" description={t('admin.settings.loginSecurity.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.loginSecurity.loading')} /> : (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">{t('admin.settings.loginSecurity.lockoutTitle')}</h3>
          <div className="space-y-5">
            <Field label={t('admin.settings.loginSecurity.enableLockout')} hint={t('admin.settings.loginSecurity.enableLockoutHint')}>
              <Switch ariaLabel={t('admin.settings.loginSecurity.enableLockout')} checked={cfg.lockout_enabled} onChange={(v) => setCfg({ ...cfg, lockout_enabled: v })} />
            </Field>
            <Field label={t('admin.settings.loginSecurity.threshold')} hint={t('admin.settings.loginSecurity.thresholdHint')}>
              <Select options={numOptions([3, 5, 8, 10], t('admin.settings.loginSecurity.times'))} value={String(cfg.lockout_threshold)} onChange={(v) => setCfg({ ...cfg, lockout_threshold: Number(v) })} />
            </Field>
            <Field label={t('admin.settings.loginSecurity.window')} hint={t('admin.settings.loginSecurity.windowHint')}>
              <Select options={numOptions([5, 10, 15, 30, 60], t('admin.settings.loginSecurity.minutes'))} value={String(cfg.lockout_window)} onChange={(v) => setCfg({ ...cfg, lockout_window: Number(v) })} />
            </Field>
            <Field label={t('admin.settings.loginSecurity.duration')} hint={t('admin.settings.loginSecurity.durationHint')}>
              <Select options={numOptions([5, 15, 30, 60, 120], t('admin.settings.loginSecurity.minutes'))} value={String(cfg.lockout_duration)} onChange={(v) => setCfg({ ...cfg, lockout_duration: Number(v) })} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">{t('admin.settings.loginSecurity.passwordPolicy')}</h3>
          <div className="space-y-5">
            <Field label={t('admin.settings.loginSecurity.minLength')} hint={t('admin.settings.loginSecurity.minLengthHint')}>
              <span className="inline-block w-24">
                <Input type="number" min={6} max={64} value={cfg.password_min_length}
                  onChange={(e) => setCfg({ ...cfg, password_min_length: Math.max(6, Math.min(64, Number(e.target.value) || 6)) })}
                  className="text-center" aria-label={t('admin.settings.loginSecurity.minLength')} />
              </span>
            </Field>
            <Field label={t('admin.settings.loginSecurity.requireMixed')} hint={t('admin.settings.loginSecurity.requireMixedHint')}>
              <Switch ariaLabel={t('admin.settings.loginSecurity.requireMixed')} checked={cfg.password_require_mixed} onChange={(v) => setCfg({ ...cfg, password_require_mixed: v })} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">{t('admin.settings.loginSecurity.accountDeletion')}</h3>
          <div className="space-y-5">
            <Field label={t('admin.settings.loginSecurity.cooldown')} hint={t('admin.settings.loginSecurity.cooldownHint')}>
              <span className="inline-block w-24">
                <Input type="number" min={0} max={90} value={cfg.account_deletion_cooldown_days}
                  onChange={(e) => setCfg({ ...cfg, account_deletion_cooldown_days: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
                  className="text-center" aria-label={t('admin.settings.loginSecurity.cooldownDays')} />
              </span>
              <span className="ml-2 text-sm text-slate-500">{t('admin.settings.loginSecurity.days')}</span>
            </Field>
          </div>
        </div>

        {message && <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.loginSecurity.save')}</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
