import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Switch, Select, Loading } from '@/components/ui'
import IconPicker from '@/components/IconPicker'
import { useTranslation } from '@/lib/i18n'
import { OAuthProviderConfig } from '@/lib/admin'

// 各 provider 的品牌图标（无对应品牌图标的用首字母兜底）与配色
const PROVIDER_ICON: Record<string, string> = {
  github: 'fa-brands fa-github',
  google: 'fa-brands fa-google',
  gitlab: 'fa-brands fa-gitlab',
}
const PROVIDER_TINT: Record<string, string> = {
  github: 'bg-slate-900 text-white',
  google: 'bg-red-50 text-red-500',
  gitlab: 'bg-orange-50 text-orange-500',
  gitee: 'bg-red-50 text-red-600',
  gitcode: 'bg-blue-50 text-blue-600',
}

// 系统设置 · 第三方登录：GitHub / Google / GitLab OAuth（仅管理员）
export default function SettingsOAuth() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const CALLBACK: Record<string, string> = {
    github: t('admin.settings.oauth.callback.github'),
    google: t('admin.settings.oauth.callback.google'),
    gitlab: t('admin.settings.oauth.callback.gitlab'),
    gitee: t('admin.settings.oauth.callback.gitee'),
    gitcode: t('admin.settings.oauth.callback.gitcode'),
  }
  const [providers, setProviders] = useState<OAuthProviderConfig[]>([])
  const [message, setMessage] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [openKey, setOpenKey] = useState('') // 当前展开配置的 provider（accordion，默认全部折叠）
  const [siteOrigin, setSiteOrigin] = useState('')
  const [loading, setLoading] = useState(true)
  const [displayMode, setDisplayMode] = useState('button') // 登录/注册页显示方式：button | icon
  const [savingMode, setSavingMode] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    setSiteOrigin(window.location.origin)
    api<{ providers: OAuthProviderConfig[]; display_mode?: string }>('/oauth')
      .then((d) => { setProviders(d.providers || []); setDisplayMode(d.display_mode === 'icon' ? 'icon' : 'button') })
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function saveDisplayMode(mode: string) {
    setDisplayMode(mode)
    setSavingMode(true)
    try {
      await api('/oauth', { method: 'PUT', body: { display_mode: mode } })
    } catch (e) {
      setMessage((e as Error).message)
    } finally { setSavingMode(false) }
  }

  function patch(provider: string, changes: Partial<OAuthProviderConfig>) {
    setProviders((list) => list.map((p) => (p.provider === provider ? { ...p, ...changes } : p)))
  }

  async function save(p: OAuthProviderConfig) {
    setSavingKey(p.provider)
    setMessage('')
    try {
      const d = await api<{ providers: OAuthProviderConfig[] }>('/oauth', {
        method: 'PUT',
        body: { provider: p.provider, client_id: p.client_id, client_secret: p.client_secret, enabled: p.enabled, icon_type: p.icon_type || '', icon_value: p.icon_value || '' },
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
      <div className="max-w-2xl space-y-4">
        {/* 全局：登录/注册页第三方入口显示方式 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Field label={t('admin.settings.oauth.displayMode')} hint={t('admin.settings.oauth.displayModeHint')}>
            <div className="max-w-xs"><Select value={displayMode} onChange={saveDisplayMode} disabled={savingMode}
              options={[
                { value: 'button', label: t('admin.settings.oauth.displayButton') },
                { value: 'icon', label: t('admin.settings.oauth.displayIcon') },
              ]} /></div>
          </Field>
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {providers.map((p) => {
            const on = p.enabled && !!p.client_id
            const open = openKey === p.provider
            return (
              <div key={p.provider}>
                {/* 折叠头：图标 + 名称 + 配置/启用状态 + 展开箭头 */}
                <button type="button" onClick={() => setOpenKey(open ? '' : p.provider)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${PROVIDER_TINT[p.provider] || 'bg-slate-100 text-slate-600'}`}>
                    {PROVIDER_ICON[p.provider]
                      ? <i className={PROVIDER_ICON[p.provider]} aria-hidden="true" />
                      : <span className="text-sm font-bold">{p.label.slice(0, 1)}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{p.label}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {p.client_id ? t('admin.settings.oauth.configured') : t('admin.settings.oauth.notConfigured')}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {on ? t('admin.settings.oauth.enabled') : t('admin.settings.oauth.disabled')}
                  </span>
                  <i className={`fa-solid fa-chevron-down shrink-0 text-xs text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {/* 展开体：回调地址说明 + 凭据 + 启用开关 + 保存 */}
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
                    <p className="mb-4 text-sm text-slate-500">
                      {t('admin.settings.oauth.instruction', { platform: CALLBACK[p.provider] || p.label })}{' '}
                      <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs">{siteOrigin || 'https://你的站点'}/api/v1/auth/oauth/{p.provider}/callback</code>。
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
                      <Field label={t('admin.settings.oauth.icon')} hint={t('admin.settings.oauth.iconHint')}>
                        <IconPicker value={{ icon_type: p.icon_type || '', icon_value: p.icon_value || '' }}
                          onChange={(v) => patch(p.provider, { icon_type: v.icon_type, icon_value: v.icon_value })}
                          fallback={PROVIDER_ICON[p.provider]?.replace('fa-brands ', '').replace('fa-solid ', '') || 'fa-right-to-bracket'} />
                      </Field>
                    </div>
                    <div className="mt-5 flex justify-end">
                      <Button loading={savingKey === p.provider} onClick={() => save(p)}>{t('admin.settings.oauth.save', { label: p.label })}</Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {message && <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
      </div>
      )}
    </SettingsLayout>
  )
}
