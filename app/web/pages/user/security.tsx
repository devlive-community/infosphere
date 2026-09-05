import { useState, FormEvent } from 'react'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { Button, Input, Field } from '@/components/ui'

export default function Security() {
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
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-slate-900">账户安全</h1>
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
  )
}
