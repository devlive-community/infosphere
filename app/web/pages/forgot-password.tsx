import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Input, Field } from '@/components/ui'

// 忘记密码：提交后无论邮箱是否存在均显示相同提示（不泄露账户信息）
export default function ForgotPassword() {
  const router = useRouter()
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const data = await api<{ message: string }>('/auth/password/forgot', {
        method: 'POST',
        body: { email: email.trim() },
      })
      setMessage(data.message || '如果该邮箱已注册，重置链接已发送')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm w-full max-w-sm p-8">
        <h1 className="text-center text-xl font-bold text-slate-900">找回密码</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">输入注册邮箱，我们会发送重置链接</p>
        {message ? (
          <>
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>
            <p className="mt-4 text-center text-sm text-slate-500">
              <Link href="/login" className="text-primary-600 hover:underline">返回登录页</Link>
            </p>
          </>
        ) : (
          <>
            {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <Field label="注册邮箱">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </Field>
              <Button className="w-full" loading={loading}>发送重置链接</Button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              想起密码了？<Link href="/login" className="text-primary-600 hover:underline">返回登录</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
