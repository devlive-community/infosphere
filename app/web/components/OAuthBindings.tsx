import { useEffect, useState, useCallback } from 'react'
import { API_BASE, api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Badge } from '@/components/ui'
import { GithubIcon } from '@/components/icons'
import type { User } from '@/lib/types'

interface Binding {
  provider: string
  provider_username: string
  created_at: string
}

const PROVIDER_NAMES: Record<string, string> = { github: 'GitHub' }

// OAuthBindings 资料页第三方账号绑定管理（当前支持 GitHub，后续 provider 在此扩展）
export default function OAuthBindings() {
  const { user, refreshUser } = useApp()
  const [bindings, setBindings] = useState<Binding[]>([])
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ bindings: Binding[] }>('/auth/oauth/bindings')
      setBindings(data.bindings || [])
    } catch { /* 未登录等情况忽略 */ }
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  if (!user || !loaded) return null

  async function unbind(provider: string) {
    if (!confirm(`确定解绑 ${PROVIDER_NAMES[provider] || provider} 账号吗？`)) return
    setWorking(true)
    setMessage('')
    setError('')
    try {
      await api(`/auth/oauth/${provider}`, { method: 'DELETE' })
      setMessage('已解绑')
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  function bind(provider: string) {
    window.location.href = `${API_BASE}/api/v1/auth/oauth/${provider}?origin=${encodeURIComponent(window.location.origin)}`
  }

  const githubBound = bindings.find((b) => b.provider === 'github')

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
      <h2 className="font-semibold text-slate-900">第三方账号</h2>
      <p className="mt-1 text-xs text-slate-400">绑定后可直接使用第三方账号登录；解绑前请确保已设置登录密码。</p>
      {message && <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
            <GithubIcon className="h-4.5 w-4.5" />
          </span>
          <div>
            <div className="text-sm font-medium text-slate-900">GitHub</div>
            {githubBound
              ? <div className="text-xs text-slate-400">已绑定：{githubBound.provider_username}</div>
              : <div className="text-xs text-slate-400">未绑定</div>}
          </div>
        </div>
        {githubBound
          ? <Button variant="danger" size="sm" loading={working} onClick={() => unbind('github')}>解绑</Button>
          : <Button variant="outline" size="sm" onClick={() => bind('github')}>绑定</Button>}
      </div>

      {!user.email && <p className="mt-3 text-xs text-amber-600">提示：尚未填写邮箱，第三方登录的关联识别会受限。</p>}
    </div>
  )
}
