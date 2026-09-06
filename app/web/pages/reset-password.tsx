import { useState, FormEvent, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { Button, Input, Field } from '@/components/ui'

// 重置密码：通过邮件链接进入，携带一次性令牌
export default function ResetPassword() {
  const router = useRouter()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [token, setToken] = useState('')
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!router.isReady) return
    setToken(typeof router.query.token === 'string' ? router.query.token : '')
    setReady(true)
  }, [router.isReady, router.query.token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) return setError('两次输入的密码不一致')
    setLoading(true)
    try {
      await api('/auth/password/reset', { method: 'POST', body: { token, password: form.password } })
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm w-full max-w-sm p-8">
        {!ready ? (
          <p className="py-6 text-center text-sm text-slate-400">加载中…</p>
        ) : done ? (
          <>
            <h1 className="text-center text-xl font-bold text-emerald-600">密码已重置</h1>
            <p className="mb-6 mt-2 text-center text-sm text-slate-500">请使用新密码登录你的账户</p>
            <p className="text-center">
              <Link href="/login" className="inline-block rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600">
                去登录
              </Link>
            </p>
          </>
        ) : !token ? (
          <>
            <h1 className="text-center text-lg font-bold text-rose-600">链接无效</h1>
            <p className="mb-6 mt-2 text-center text-sm text-slate-500">缺少重置令牌，请通过邮件链接进入本页</p>
            <p className="text-center text-sm">
              <Link href="/forgot-password" className="text-primary-600 hover:underline">重新申请找回密码</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-center text-xl font-bold text-slate-900">设置新密码</h1>
            <p className="mb-6 mt-1 text-center text-sm text-slate-500">请输入新的登录密码</p>
            {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <Field label="新密码（至少 6 位）">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
              </Field>
              <Field label="确认新密码">
                <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
              </Field>
              <Button className="w-full" loading={loading}>重置密码</Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
