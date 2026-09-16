import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Switch, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { MailConfig, emptyMail } from '@/lib/admin'

// 系统设置 · 邮件服务：SMTP 配置与找回密码发信（仅管理员）
export default function SettingsMail() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [mail, setMail] = useState<MailConfig>(emptyMail)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<MailConfig>('/mail')
      .then(setMail)
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api('/mail', { method: 'PUT', body: mail })
      setMessage(t('admin.settings.mail.saved'))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="mail" description={t('admin.settings.mail.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.mail.loading')} /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('admin.settings.mail.driver')}>
              <Select
                options={[{ value: 'log', label: t('admin.settings.mail.driverLog') }, { value: 'smtp', label: 'SMTP' }]}
                value={mail.driver || 'log'} onChange={(v) => setMail({ ...mail, driver: v })} />
            </Field>
            <Field label={t('admin.settings.mail.smtpPort')} hint={t('admin.settings.mail.smtpPortHint')}>
              <Input type="number" value={mail.port || ''} onChange={(e) => setMail({ ...mail, port: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label={t('admin.settings.mail.smtpHost')}>
            <Input value={mail.host || ''} onChange={(e) => setMail({ ...mail, host: e.target.value })}
              placeholder="smtp.example.com" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('admin.settings.mail.smtpUsername')}>
              <Input value={mail.username || ''} onChange={(e) => setMail({ ...mail, username: e.target.value })} />
            </Field>
            <Field label={t('admin.settings.mail.smtpPassword')}>
              <Input type="password" value={mail.password || ''} onChange={(e) => setMail({ ...mail, password: e.target.value })} placeholder={t('admin.settings.mail.smtpPasswordPlaceholder')} />
            </Field>
          </div>
          <Field label={t('admin.settings.mail.fromAddress')}>
            <Input value={mail.from || ''} onChange={(e) => setMail({ ...mail, from: e.target.value })}
              placeholder="noreply@example.com" />
          </Field>
          <div className="border-t border-slate-100 pt-4">
            <Field label={t('admin.settings.mail.notificationsEnabled')} hint={t('admin.settings.mail.notificationsEnabledHint')}>
              <Switch ariaLabel={t('admin.settings.mail.notificationsEnabled')} checked={!!mail.notifications_enabled} onChange={(v) => setMail({ ...mail, notifications_enabled: v })} />
            </Field>
          </div>
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.mail.save')}</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
