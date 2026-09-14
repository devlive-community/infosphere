import { useState, FormEvent, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Button, ButtonLink, Input, Field, Loading } from '@/components/ui'

// 重置密码：通过邮件链接进入，携带一次性令牌
export default function ResetPassword() {
  const router = useRouter()
  const { t } = useTranslation()
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
    if (form.password !== form.confirm) return setError(t('auth.reset.passwordMismatch'))
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
          <Loading className="py-6" label={t('auth.reset.verifying')} />
        ) : done ? (
          <>
            <h1 className="text-center text-xl font-bold text-emerald-600">{t('auth.reset.doneTitle')}</h1>
            <p className="mb-6 mt-2 text-center text-sm text-slate-500">{t('auth.reset.doneSubtitle')}</p>
            <p className="text-center">
              <ButtonLink href="/login">
                {t('auth.reset.goLogin')}
              </ButtonLink>
            </p>
          </>
        ) : !token ? (
          <>
            <h1 className="text-center text-lg font-bold text-rose-600">{t('auth.reset.invalidTitle')}</h1>
            <p className="mb-6 mt-2 text-center text-sm text-slate-500">{t('auth.reset.invalidSubtitle')}</p>
            <p className="text-center text-sm">
              <Link href="/forgot-password" className="text-primary-600 hover:underline">{t('auth.reset.reapply')}</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-center text-xl font-bold text-slate-900">{t('auth.reset.title')}</h1>
            <p className="mb-6 mt-1 text-center text-sm text-slate-500">{t('auth.reset.subtitle')}</p>
            {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <Field label={t('auth.reset.newPasswordLabel')}>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={t('auth.reset.newPasswordPlaceholder')} autoFocus />
              </Field>
              <Field label={t('auth.reset.confirmLabel')}>
                <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder={t('auth.reset.confirmPlaceholder')} />
              </Field>
              <Button className="w-full" loading={loading}>{t('auth.reset.submit')}</Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
