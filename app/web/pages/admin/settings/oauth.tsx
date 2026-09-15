import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Switch, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { OAuthProviderConfig } from '@/lib/admin'

// 各 provider 的回调路径说明
const CALLBACK: Record<string, string> = {
  github: 'GitHub「Developer settings → OAuth Apps」',
  google: 'Google Cloud Console「凭据 → OAuth 客户端 ID」',
  gitlab: 'GitLab「用户设置 → Applications」',
}

// 系统设置 · 第三方登录：GitHub / Google / GitLab OAuth（仅管理员）
export default function SettingsOAuth() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [providers, setProviders] = useState<OAuthProviderConfig[]>([])
  const [message, setMessage] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [siteOrigin, setSiteOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    setSiteOrigin(window.location.origin)
    api<{ providers: OAuthProviderConfig[] }>('/oauth')
      .then((d) => setProviders(d.providers || []))
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  function patch(provider: string, changes: Partial<OAuthProviderConfig>) {
    setProviders((list) => list.map((p) => (p.provider === provider ? { ...p, ...changes } : p)))
  }

  async function save(p: OAuthProviderConfig) {
    setSavingKey(p.provider)
    setMessage('')
    try {
      const d = await api<{ providers: OAuthProviderConfig[] }>('/oauth', {
        method: 'PUT',
        body: { provider: p.provider, client_id: p.client_id, client_secret: p.client_secret, enabled: p.enabled },
      })
      setProviders(d.providers || [])
      setMessage(t('admin.settings.oauth.saved', { label: p.label }))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSavingKey('')
    }
  }

  return (
    <SettingsLayout active="oauth" description={t('admin.settings.oauth.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.oauth.loading')} /> : (
      <div className="max-w-2xl space-y-5">
        {providers.map((p) => (
          <div key={p.provider} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{p.label}</h3>
              <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${p.enabled && p.client_id ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {p.enabled && p.client_id ? t('admin.settings.oauth.enabled') : t('admin.settings.oauth.disabled')}
              </span>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {t('admin.settings.oauth.instruction', { platform: CALLBACK[p.provider] || p.label })}{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{siteOrigin || 'https://你的站点'}/api/v1/auth/oauth/{p.provider}/callback</code>。
            </p>
            <div className="space-y-4">
              <Field label="Client ID">
                <Input value={p.client_id} onChange={(e) => patch(p.provider, { client_id: e.target.value })} placeholder={`${p.label} OAuth Client ID`} />
              </Field>
              <Field label="Client Secret">
                <Input type="password" value={p.client_secret} onChange={(e) => patch(p.provider, { client_secret: e.target.value })} placeholder={`${p.label} OAuth Client Secret`} />
              </Field>
              <Field label={t('admin.settings.oauth.enableStatus')} hint={t('admin.settings.oauth.enableStatusHint')}>
                <Switch ariaLabel={t('admin.settings.oauth.enableSwitch', { label: p.label })} checked={p.enabled} onChange={(v) => patch(p.provider, { enabled: v })} />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Button loading={savingKey === p.provider} onClick={() => save(p)}>{t('admin.settings.oauth.save', { label: p.label })}</Button>
            </div>
          </div>
        ))}
        {message && <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
      </div>
      )}
    </SettingsLayout>
  )
}
