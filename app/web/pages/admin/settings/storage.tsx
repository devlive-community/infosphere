import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Loading } from '@/components/ui'
import { StorageConfig, emptyStorage } from '@/lib/admin'

// 系统设置 · 存储配置：本地磁盘或七牛云对象存储（仅管理员）
export default function SettingsStorage() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
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
      setMessage('存储配置已保存')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="storage" description="图片上传的存储位置：本地磁盘（默认，随数据目录备份）或七牛云对象存储（切换后新上传的图片写入七牛，历史图片仍在本地）。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载存储配置…" /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <Field label="存储驱动">
            <Select
              options={[{ value: 'local', label: '本地磁盘' }, { value: 'qiniu', label: '七牛云' }]}
              value={storage.driver || 'local'} onChange={(v) => setStorage({ ...storage, driver: v })} />
          </Field>
          {storage.driver === 'qiniu' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Access Key">
                  <Input value={storage.qiniu_access_key || ''} onChange={(e) => setStorage({ ...storage, qiniu_access_key: e.target.value })} />
                </Field>
                <Field label="Secret Key">
                  <Input type="password" value={storage.qiniu_secret_key || ''} onChange={(e) => setStorage({ ...storage, qiniu_secret_key: e.target.value })} />
                </Field>
              </div>
              <Field label="存储空间（Bucket）">
                <Input value={storage.qiniu_bucket || ''} onChange={(e) => setStorage({ ...storage, qiniu_bucket: e.target.value })} />
              </Field>
              <Field label="CDN 绑定域名" hint="上传后返回的图片地址前缀，例如 https://cdn.example.com">
                <Input value={storage.qiniu_domain || ''} onChange={(e) => setStorage({ ...storage, qiniu_domain: e.target.value })}
                  placeholder="https://cdn.example.com" />
              </Field>
              <Field label="上传区域地址" hint="按存储空间所在区域选择，默认华东">
                <Input value={storage.qiniu_upload_host || ''} onChange={(e) => setStorage({ ...storage, qiniu_upload_host: e.target.value })}
                  placeholder="https://upload.qiniup.com（华东）；华南 https://upload-z2.qiniup.com" />
              </Field>
            </>
          )}
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>保存存储配置</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
