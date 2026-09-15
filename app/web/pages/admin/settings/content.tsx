import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Input, Switch, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface ContentSettings {
  upload_max_mb: number
  upload_allowed_exts: string
  comments_enabled: boolean
}

// 系统设置 · 内容设置：上传限制与全站评论开关（仅管理员）
export default function SettingsContent() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<ContentSettings>({ upload_max_mb: 10, upload_allowed_exts: '', comments_enabled: true })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<ContentSettings>('/content-settings').then(setCfg).catch((e) => setMessage((e as Error).message)).finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await api<ContentSettings>('/content-settings', { method: 'PUT', body: cfg })
      setCfg(saved)
      setMessage(t('admin.settings.content.saved'))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="content" description={t('admin.settings.content.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.content.loading')} /> : (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">{t('admin.settings.content.uploadLimit')}</h3>
          <div className="space-y-5">
            <Field label={t('admin.settings.content.maxFileSize')} hint={t('admin.settings.content.maxFileSizeHint')}>
              <span className="inline-block w-24">
                <Input type="number" min={1} max={100} value={cfg.upload_max_mb}
                  onChange={(e) => setCfg({ ...cfg, upload_max_mb: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                  className="text-center" aria-label={t('admin.settings.content.maxFileSize')} />
              </span>
            </Field>
            <Field label={t('admin.settings.content.allowedTypes')} hint={t('admin.settings.content.allowedTypesHint')}>
              <Input value={cfg.upload_allowed_exts} onChange={(e) => setCfg({ ...cfg, upload_allowed_exts: e.target.value })}
                placeholder=".png,.jpg,.jpeg,.gif,.webp,.svg,.ico" aria-label={t('admin.settings.content.allowedTypes')} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">{t('admin.settings.content.comments')}</h3>
          <Field label={t('admin.settings.content.enableComments')} hint={t('admin.settings.content.enableCommentsHint')}>
            <Switch ariaLabel={t('admin.settings.content.enableComments')} checked={cfg.comments_enabled} onChange={(v) => setCfg({ ...cfg, comments_enabled: v })} />
          </Field>
        </div>

        {message && <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.content.save')}</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
