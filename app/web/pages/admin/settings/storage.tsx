import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Loading, Switch } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { StorageConfig, emptyStorage } from '@/lib/admin'

// 系统设置 · 存储配置：本地磁盘、七牛云或 S3 兼容对象存储（仅管理员）
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
      setStorage(await api<StorageConfig>('/storage')) // 重新读取：Secret Key 只写，刷新「已配置」状态并清空输入
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
              options={[{ value: 'local', label: t('admin.settings.storage.driverLocal') }, { value: 'qiniu', label: t('admin.settings.storage.driverQiniu') }, { value: 's3', label: t('admin.settings.storage.driverS3') }]}
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
          {storage.driver === 's3' && (
            <>
              <p className="text-xs leading-5 text-slate-500">{t('admin.settings.storage.s3Intro')}</p>
              <Field label={t('admin.settings.storage.s3Endpoint')} hint={t('admin.settings.storage.s3EndpointHint')}>
                <Input value={storage.s3_endpoint || ''} onChange={(e) => setStorage({ ...storage, s3_endpoint: e.target.value })} placeholder="https://oss-cn-hangzhou.aliyuncs.com" />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('admin.settings.storage.bucket')}>
                  <Input value={storage.s3_bucket || ''} onChange={(e) => setStorage({ ...storage, s3_bucket: e.target.value })} />
                </Field>
                <Field label={t('admin.settings.storage.s3Region')} hint={t('admin.settings.storage.s3RegionHint')}>
                  <Input value={storage.s3_region || ''} onChange={(e) => setStorage({ ...storage, s3_region: e.target.value })} placeholder="us-east-1" />
                </Field>
                <Field label="Access Key">
                  <Input value={storage.s3_access_key || ''} autoComplete="off" onChange={(e) => setStorage({ ...storage, s3_access_key: e.target.value })} />
                </Field>
                <Field label="Secret Key">
                  <Input type="password" autoComplete="new-password" value={storage.s3_secret_key || ''} onChange={(e) => setStorage({ ...storage, s3_secret_key: e.target.value })}
                    placeholder={storage.s3_secret_key_set ? t('admin.settings.storage.secretSet') : ''} />
                </Field>
              </div>
              <Field label={t('admin.settings.storage.s3PublicUrl')} hint={t('admin.settings.storage.s3PublicUrlHint')}>
                <Input value={storage.s3_public_url || ''} onChange={(e) => setStorage({ ...storage, s3_public_url: e.target.value })} placeholder="https://img.example.com" />
              </Field>
              <Field label={t('admin.settings.storage.s3Prefix')}>
                <Input value={storage.s3_prefix || ''} onChange={(e) => setStorage({ ...storage, s3_prefix: e.target.value })} placeholder="knowforge/" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Switch checked={Boolean(storage.s3_path_style)} onChange={(v) => setStorage({ ...storage, s3_path_style: v })} ariaLabel={t('admin.settings.storage.s3PathStyle')} />
                {t('admin.settings.storage.s3PathStyle')}
              </label>
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
