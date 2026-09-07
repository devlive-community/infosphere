import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Loading } from '@/components/ui'
import { OAuthConfig } from '@/lib/admin'

// 系统设置 · 第三方登录：GitHub OAuth 应用凭据（仅管理员）
export default function SettingsOAuth() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [oauth, setOauth] = useState({ client_id: '', client_secret: '' })
  const [enabled, setEnabled] = useState('false')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [siteOrigin, setSiteOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    setSiteOrigin(window.location.origin)
    api<OAuthConfig>('/oauth')
      .then((cfg) => {
        setOauth({ client_id: cfg.client_id || '', client_secret: cfg.client_secret || '' })
        setEnabled(cfg.client_id && cfg.client_secret ? 'true' : 'false')
      })
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api('/oauth', { method: 'PUT', body: { client_id: oauth.client_id, client_secret: oauth.client_secret, enabled: enabled === 'true' } })
      setMessage('GitHub 登录配置已保存')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="oauth" description="接入 GitHub OAuth 后，用户可使用 GitHub 账户一键登录。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载第三方登录配置…" /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-sm text-slate-500">
          在 GitHub「Developer settings → OAuth Apps」创建应用后填入凭据，回调地址填写{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{siteOrigin || 'https://你的站点'}/api/v1/auth/oauth/github/callback</code>。
        </p>
        <div className="space-y-4">
          <Field label="Client ID">
            <Input value={oauth.client_id} onChange={(e) => setOauth({ ...oauth, client_id: e.target.value })}
              placeholder="GitHub OAuth App Client ID" />
          </Field>
          <Field label="Client Secret">
            <Input type="password" value={oauth.client_secret} onChange={(e) => setOauth({ ...oauth, client_secret: e.target.value })}
              placeholder="GitHub OAuth App Client Secret" />
          </Field>
          <Field label="启用状态" hint="停用后登录/注册页不再显示 GitHub 入口">
            <Select
              options={[{ value: 'true', label: '启用' }, { value: 'false', label: '停用' }]}
              value={enabled} onChange={setEnabled} />
          </Field>
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>保存配置</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
