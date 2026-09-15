import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Select, Switch, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface RegistrationSettings {
  mode: string
  require_email: boolean
  require_activation: boolean
}

// 系统设置 · 注册设置：注册方式 / 绑定邮箱 / 激活邮箱（仅管理员）
export default function SettingsRegistration() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<RegistrationSettings>({ mode: 'open', require_email: false, require_activation: false })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const MODE_OPTIONS = [
    { value: 'open', label: t('admin.settings.registration.modeOpen') },
    { value: 'open_invite', label: t('admin.settings.registration.modeOpenInvite') },
    { value: 'invite', label: t('admin.settings.registration.modeInvite') },
    { value: 'closed', label: t('admin.settings.registration.modeClosed') },
  ]

  useEffect(() => {
    if (!isAdmin) return
    api<RegistrationSettings>('/registration')
      .then(setCfg)
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await api<RegistrationSettings>('/registration', { method: 'PUT', body: cfg })
      setCfg(saved)
      setMessage(t('admin.settings.registration.saved'))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="registration" description={t('admin.settings.registration.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.registration.loading')} /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <Field label={t('admin.settings.registration.mode')} hint={t('admin.settings.registration.modeHint')}>
            <Select options={MODE_OPTIONS} value={cfg.mode} onChange={(v) => setCfg({ ...cfg, mode: v })} />
          </Field>

          <Field label={t('admin.settings.registration.requireEmail')} hint={t('admin.settings.registration.requireEmailHint')}>
            <Switch ariaLabel={t('admin.settings.registration.requireEmail')} checked={cfg.require_email} onChange={(v) => setCfg({ ...cfg, require_email: v })} />
          </Field>

          <Field label={t('admin.settings.registration.requireActivation')} hint={t('admin.settings.registration.requireActivationHint')}>
            <Switch ariaLabel={t('admin.settings.registration.requireActivation')} checked={cfg.require_activation} disabled={!cfg.require_email} onChange={(v) => setCfg({ ...cfg, require_activation: v })} />
          </Field>
        </div>

        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.registration.save')}</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
