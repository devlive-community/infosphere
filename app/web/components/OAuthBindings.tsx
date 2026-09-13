import { useEffect, useState, useCallback } from 'react'
import { API_BASE, api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Loading, useFeedback } from '@/components/ui'

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

  if (!user) return null
  if (!loaded) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <Loading className="py-10" label="正在加载第三方账号…" />
      </div>
    )
  }

  async function unbind(provider: string) {
    const label = PROVIDER_META[provider]?.label || provider
    if (!await confirmAction({
      title: '解绑第三方账号',
      message: `确定解绑 ${label} 账号吗？解绑前请确认已设置登录密码。`,
      confirmLabel: '确认解绑',
      danger: true,
    })) return
    setWorking(provider)
    setMessage('')
    setError('')
    try {
      await api(`/auth/oauth/${provider}`, { method: 'DELETE' })
      setMessage('已解绑')
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking('')
    }
  }

  function bind(provider: string) {
    window.location.href = `${API_BASE}/api/v1/auth/oauth/${provider}?origin=${encodeURIComponent(window.location.origin)}`
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-900">第三方账号</h2>
      <p className="mt-1 text-xs text-slate-400">绑定后可直接使用第三方账号登录；解绑前请确保已设置登录密码。</p>
      {message && <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

      {providers.length === 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-400">管理员尚未启用任何第三方登录方式。</div>
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
                  ? <div className="text-xs text-slate-400">已绑定：{bound.provider_username}</div>
                  : <div className="text-xs text-slate-400">未绑定</div>}
              </div>
            </div>
            {bound
              ? <Button variant="danger" size="sm" loading={working === provider} onClick={() => unbind(provider)}>解绑</Button>
              : <Button variant="outline" size="sm" onClick={() => bind(provider)}>绑定</Button>}
          </div>
        )
      })}

      {!user.email && <p className="mt-3 text-xs text-amber-600">提示：尚未填写邮箱，第三方登录的关联识别会受限。</p>}
    </div>
  )
}
