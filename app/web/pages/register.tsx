import { useState, FormEvent, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import type { User } from '@/lib/types'

export default function Register() {
  const router = useRouter()
  const { user, login } = useApp()
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) router.replace('/')
  }, [user, router])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) return setError('两次输入的密码不一致')
    setLoading(true)
    try {
      const data = await api<{ token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: { username: form.username, email: form.email, password: form.password },
      })
      login(data.token, data.user)
      router.replace('/')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-center text-xl font-bold text-slate-900">注册账户</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">加入 InfoSphere，开始记录知识</p>
        {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">用户名（3-50 位字母数字下划线）</label>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="label">邮箱（可选）</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">密码（至少 6 位）</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">确认密码</label>
            <input type="password" className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
          <button className="btn-primary w-full" disabled={loading}>{loading ? '注册中…' : '注 册'}</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          已有账户？<Link href="/login" className="text-primary-600 hover:underline">直接登录</Link>
        </p>
      </div>
    </div>
  )
}
