import { useState, FormEvent, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Input, Field } from '@/components/ui'
import OAuthButtons, { oauthErrorText } from '@/components/OAuthButtons'
import type { User } from '@/lib/types'

export default function Login() {
  const router = useRouter()
  const { user, login } = useApp()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) router.replace('/')
  }, [user, router])

  useEffect(() => {
    if (router.isReady && typeof router.query.oauth_error === 'string') {
      setError(oauthErrorText(router.query.oauth_error))
    }
  }, [router.isReady, router.query.oauth_error])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: form })
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
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm w-full max-w-sm p-8">
        <h1 className="text-center text-xl font-bold text-slate-900">登录 InfoSphere</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">继续你的知识之旅</p>
        {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <Field label="用户名 / 邮箱">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus />
          </Field>
          <Field label="密码">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Button className="w-full" loading={loading}>登 录</Button>
        </form>
        <OAuthButtons label="登录" />
        <p className="mt-4 text-center text-sm text-slate-500">
          还没有账户？<Link href="/register" className="text-primary-600 hover:underline">立即注册</Link>
        </p>
      </div>
    </div>
  )
}
