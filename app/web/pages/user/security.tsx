import { useState, FormEvent } from 'react'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'

export default function Security() {
  const user = useRequireAuth()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (!user) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    if (newPassword !== confirm) return setError('两次输入的新密码不一致')
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
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-slate-900">账户安全</h1>
      <div className="card mb-6 p-6">
        <h2 className="mb-2 font-semibold text-slate-900">账户信息</h2>
        <dl className="space-y-1 text-sm text-slate-600">
          <div className="flex"><dt className="w-24 text-slate-400">用户名</dt><dd>{user.username}</dd></div>
          <div className="flex"><dt className="w-24 text-slate-400">注册时间</dt><dd>{formatDate(user.created_at)}</dd></div>
          <div className="flex"><dt className="w-24 text-slate-400">最近登录</dt><dd>{formatDate(user.last_login_at)}</dd></div>
        </dl>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <h2 className="font-semibold text-slate-900">修改密码</h2>
        {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
        <div>
          <label className="label">当前密码</label>
          <input type="password" className="input" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
        </div>
        <div>
          <label className="label">新密码（至少 6 位）</label>
          <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className="label">确认新密码</label>
          <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" type="submit">更新密码</button>
        </div>
      </form>
    </div>
  )
}
