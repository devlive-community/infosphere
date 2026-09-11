import { useEffect, useState } from 'react'
import Link from 'next/link'
import Seo from '@/components/Seo'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import UserAvatar from '@/components/UserAvatar'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Input, Loading, EmptyState, useFeedback } from '@/components/ui'

interface InvitedUser {
  username: string
  avatar?: string
  created_at: string
}

export default function InvitePage() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { showToast } = useFeedback()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [invited, setInvited] = useState<InvitedUser[] | null>(null)

  useEffect(() => {
    if (!user) return
    api<{ invite_code: string }>('/auth/invite-code').then((d) => setCode(d.invite_code || '')).catch(() => {})
    api<{ items: InvitedUser[] }>('/auth/invited').then((d) => setInvited(d.items || [])).catch(() => setInvited([]))
  }, [user])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载账户信息…" />

  async function enable() {
    setBusy(true)
    try {
      const d = await api<{ invite_code: string }>('/auth/invite-code', { method: 'POST' })
      setCode(d.invite_code || '')
    } catch (e) {
      showToast({ message: (e as Error).message || '开启失败', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  async function disable() {
    setBusy(true)
    try {
      await api('/auth/invite-code', { method: 'DELETE' })
      setCode('')
    } catch (e) {
      showToast({ message: (e as Error).message || '关闭失败', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      showToast({ message: '邀请码已复制', tone: 'success' })
    } catch {
      showToast({ message: '复制失败，请手动复制', tone: 'error' })
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="邀请码" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">账户设置</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">账户设置</h1>
          <p className="mt-2 text-[15px] text-slate-500">管理你的专属邀请码与邀请记录</p>
        </div>

        <AccountSettingsLayout user={user} active="invite">
          {/* 邀请码 */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-bold text-slate-900">我的邀请码</h2>
              <p className="mt-1 text-sm text-slate-500">默认不开启。开启后会生成你的专属邀请码，分享给朋友即可用于注册。</p>
            </div>
            <div className="px-6 pb-6">
              {code ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <Input value={code} readOnly className="font-mono text-base tracking-[0.3em]" aria-label="我的邀请码" />
                  </span>
                  <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={copy}>复制</Button>
                  <Button type="button" variant="ghost" loading={busy} className="shrink-0 whitespace-nowrap text-rose-600 hover:bg-rose-50" onClick={disable}>关闭</Button>
                </div>
              ) : (
                <Button type="button" variant="outline" loading={busy} onClick={enable}>开启邀请码</Button>
              )}
            </div>
          </div>

          {/* 我邀请的用户 */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-bold text-slate-900">我邀请的用户</h2>
              <p className="mt-1 text-sm text-slate-500">通过你的邀请码注册的用户；关闭邀请码后仍可查看历史记录。</p>
            </div>
            <div className="px-6 pb-6">
              {invited === null ? (
                <Loading className="py-8" label="正在加载邀请记录…" />
              ) : invited.length === 0 ? (
                <EmptyState>还没有人通过你的邀请码注册</EmptyState>
              ) : (
                <div className="divide-y divide-slate-100">
                  {invited.map((u) => (
                    <div key={u.username} className="flex items-center gap-3 py-3">
                      <UserAvatar user={u} size="h-9 w-9" link={false} tooltip={false} />
                      <div className="min-w-0">
                        <Link href={`/user/${encodeURIComponent(u.username)}`} className="font-medium text-slate-800 hover:text-primary-600">{u.username}</Link>
                        <div className="text-xs text-slate-400">注册于 {formatDate(u.created_at).slice(0, 10)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
