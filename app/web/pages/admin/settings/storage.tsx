import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { StorageConfig, emptyStorage } from '@/lib/admin'

// 系统设置 · 存储配置：本地磁盘或七牛云对象存储（仅管理员）
export default function SettingsStorage() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [storage, setStorage] = useState<StorageConfig>(emptyStorage)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<StorageConfig>('/storage')
      .then(setStorage)
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api('/storage', { method: 'PUT', body: storage })
      setMessage(t('admin.settings.storage.saved'))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="storage" description={t('admin.settings.storage.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.storage.loading')} /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <Field label={t('admin.settings.storage.driver')}>
            <Select
              options={[{ value: 'local', label: t('admin.settings.storage.driverLocal') }, { value: 'qiniu', label: t('admin.settings.storage.driverQiniu') }]}
              value={storage.driver || 'local'} onChange={(v) => setStorage({ ...storage, driver: v })} />
          </Field>
          {storage.driver === 'qiniu' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Access Key">
                  <Input value={storage.qiniu_access_key || ''} onChange={(e) => setStorage({ ...storage, qiniu_access_key: e.target.value })} />
                </Field>
                <Field label="Secret Key">
                  <Input type="password" value={storage.qiniu_secret_key || ''} onChange={(e) => setStorage({ ...storage, qiniu_secret_key: e.target.value })} placeholder={t('admin.settings.storage.secretKeyPlaceholder')} />
                </Field>
              </div>
              <Field label={t('admin.settings.storage.bucket')}>
                <Input value={storage.qiniu_bucket || ''} onChange={(e) => setStorage({ ...storage, qiniu_bucket: e.target.value })} />
              </Field>
              <Field label={t('admin.settings.storage.cdnDomain')} hint={t('admin.settings.storage.cdnDomainHint')}>
                <Input value={storage.qiniu_domain || ''} onChange={(e) => setStorage({ ...storage, qiniu_domain: e.target.value })}
                  placeholder="https://cdn.example.com" />
              </Field>
              <Field label={t('admin.settings.storage.uploadHost')} hint={t('admin.settings.storage.uploadHostHint')}>
                <Input value={storage.qiniu_upload_host || ''} onChange={(e) => setStorage({ ...storage, qiniu_upload_host: e.target.value })}
                  placeholder={t('admin.settings.storage.uploadHostPlaceholder')} />
              </Field>
            </>
          )}
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.storage.save')}</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
