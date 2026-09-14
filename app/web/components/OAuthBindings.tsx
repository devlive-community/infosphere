import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { oauthErrorKey } from '@/components/OAuthButtons'
import { Button, Loading, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface Binding {
  provider: string
  provider_username: string
  created_at: string
}

const PROVIDER_META: Record<string, { label: string; icon: string }> = {
  github: { label: 'GitHub', icon: 'fa-github' },
  google: { label: 'Google', icon: 'fa-google' },
  gitlab: { label: 'GitLab', icon: 'fa-gitlab' },
}

// OAuthBindings 资料页第三方账号绑定管理：列出所有已启用的登录方式，分别显示绑定/未绑定与操作。
export default function OAuthBindings() {
  const { confirmAction } = useFeedback()
  const { user } = useApp()
  const { t } = useTranslation()
  const [providers, setProviders] = useState<string[]>([])
  const [bindings, setBindings] = useState<Binding[]>([])
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState('')

  const load = useCallback(async () => {
    try {
      const [prov, binds] = await Promise.all([
        api<{ providers: { provider: string; enabled: boolean }[] }>('/auth/oauth/providers').catch(() => ({ providers: [] })),
        api<{ bindings: Binding[] }>('/auth/oauth/bindings').catch(() => ({ bindings: [] })),
      ])
      setProviders((prov.providers || []).filter((p) => p.enabled).map((p) => p.provider))
      setBindings(binds.bindings || [])
    } catch { /* 忽略 */ }
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  // 绑定回跳：读取 ?linked / ?oauth_error 提示并清理地址
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linked = params.get('linked')
    const err = params.get('oauth_error')
    if (!linked && !err) return
    if (linked) setMessage(t('account.oauth.linked', { provider: PROVIDER_META[linked]?.label || linked }))
    if (err) setError(t(oauthErrorKey(err), { code: err }))
    params.delete('linked')
    params.delete('oauth_error')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null
  if (!loaded) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <Loading className="py-10" label={t('account.oauth.loading')} />
      </div>
    )
  }

  async function unbind(provider: string) {
    const label = PROVIDER_META[provider]?.label || provider
    if (!await confirmAction({
      title: t('account.oauth.unbindTitle'),
      message: t('account.oauth.unbindConfirm', { provider: label }),
      confirmLabel: t('account.oauth.unbindConfirmLabel'),
      danger: true,
    })) return
    setWorking(provider)
    setMessage('')
    setError('')
    try {
      await api(`/auth/oauth/${provider}`, { method: 'DELETE' })
      setMessage(t('account.oauth.unbound'))
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking('')
    }
  }

  async function bind(provider: string) {
    setMessage('')
    setError('')
    try {
      // 绑定走带当前用户身份的链接流程：回调时按当前账号绑定，不依赖邮箱是否与该第三方一致。
      const d = await api<{ redirect: string }>(`/auth/oauth/${provider}/link`, { method: 'POST' })
      if (d.redirect) window.location.href = d.redirect
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-900">{t('account.oauth.heading')}</h2>
      <p className="mt-1 text-xs text-slate-400">{t('account.oauth.desc')}</p>
      {message && <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

      {providers.length === 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-400">{t('account.oauth.noneEnabled')}</div>
      ) : providers.map((provider) => {
        const meta = PROVIDER_META[provider] || { label: provider, icon: 'fa-right-to-bracket' }
        const bound = bindings.find((b) => b.provider === provider)
        return (
          <div key={provider} className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
                <i className={`fa-brands ${meta.icon} text-base`} aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-medium text-slate-900">{meta.label}</div>
                {bound
                  ? <div className="text-xs text-slate-400">{t('account.oauth.boundAs', { name: bound.provider_username })}</div>
                  : <div className="text-xs text-slate-400">{t('account.oauth.notBound')}</div>}
              </div>
            </div>
            {bound
              ? <Button variant="danger" size="sm" loading={working === provider} onClick={() => unbind(provider)}>{t('account.oauth.unbind')}</Button>
              : <Button variant="outline" size="sm" onClick={() => bind(provider)}>{t('account.oauth.bind')}</Button>}
          </div>
        )
      })}

      {!user.email && <p className="mt-3 text-xs text-amber-600">{t('account.oauth.noEmailHint')}</p>}
    </div>
  )
}
