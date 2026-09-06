import { useState, FormEvent , Fragment } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth , useApp} from '@/lib/auth'
import { Button, Input, Field } from '@/components/ui'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'

export default function Security() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!user) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    if (newPassword !== confirm) return setError('两次输入的新密码不一致')
    setSaving(true)
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: { old_password: oldPassword, new_password: newPassword },
      })
      setMessage('密码已更新')
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="账户设置" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">账户设置</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">账户设置</h1>
          <p className="mt-2 text-[15px] text-slate-500">管理你的个人信息与登录安全</p>
        </div>
      <AccountSettingsLayout user={user} active="security">
        <div className="min-w-0">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-6 p-6">
        <h2 className="mb-2 font-semibold text-slate-900">账户信息</h2>
        <dl className="space-y-1 text-sm text-slate-600">
          <div className="flex"><dt className="w-24 text-slate-400">用户名</dt><dd>{user.username}</dd></div>
          <div className="flex"><dt className="w-24 text-slate-400">注册时间</dt><dd>{formatDate(user.created_at)}</dd></div>
          <div className="flex"><dt className="w-24 text-slate-400">最近登录</dt><dd>{formatDate(user.last_login_at)}</dd></div>
        </dl>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white shadow-sm space-y-4 p-6">
        <h2 className="font-semibold text-slate-900">修改密码</h2>
        {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
        <Field label="当前密码">
          <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
        </Field>
        <Field label="新密码（至少 6 位）">
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <Field label="确认新密码">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>更新密码</Button>
        </div>
        </form>
      </div>
      </AccountSettingsLayout>
    </Container>
  </>
  )
}
