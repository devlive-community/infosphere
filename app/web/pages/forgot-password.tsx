import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Button, Input, Field } from '@/components/ui'

// 忘记密码：提交后无论邮箱是否存在均显示相同提示（不泄露账户信息）
export default function ForgotPassword() {
  const { t } = useTranslation()
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
      setMessage(data.message || t('auth.forgot.sentFallback'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm w-full max-w-sm p-8">
        <h1 className="text-center text-xl font-bold text-slate-900">{t('auth.forgot.title')}</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">{t('auth.forgot.subtitle')}</p>
        {message ? (
          <>
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>
            <p className="mt-4 text-center text-sm text-slate-500">
              <Link href="/login" className="text-primary-600 hover:underline">{t('auth.forgot.backToLogin')}</Link>
            </p>
          </>
        ) : (
          <>
            {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <Field label={t('auth.forgot.emailLabel')}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </Field>
              <Button className="w-full" loading={loading}>{t('auth.forgot.submit')}</Button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              {t('auth.forgot.rememberedPrefix')}<Link href="/login" className="text-primary-600 hover:underline">{t('auth.forgot.backToLoginShort')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
