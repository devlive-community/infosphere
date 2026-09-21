import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Loading } from '@/components/ui'
import Seo from '@/components/Seo'

// 邮箱激活落地页：凭链接中的一次性令牌激活邮箱。
export default function VerifyEmail() {
  const router = useRouter()
  const { site, refreshUser } = useApp()
  const { t } = useTranslation()
  const siteName = site.site_name || 'KnowForge'
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!router.isReady) return
    const token = typeof router.query.token === 'string' ? router.query.token : ''
    if (!token) {
      setStatus('error')
      setMessage(t('auth.verify.missingToken'))
      return
    }
    api('/auth/email/verify', { method: 'POST', body: { token } })
      .then(() => {
        setStatus('ok')
        refreshUser?.().catch(() => { /* 未登录则忽略 */ })
      })
      .catch((e) => {
        setStatus('error')
        setMessage((e as Error).message || t('auth.verify.failed'))
      })
  }, [router.isReady, router.query.token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
      <Seo siteName={siteName} title={t('auth.verify.seoTitle')} noindex />
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {status === 'loading' && <Loading className="py-6" label={t('auth.verify.activating')} />}
        {status === 'ok' && (
          <>
            <i className="fa-solid fa-circle-check mb-3 block text-3xl text-emerald-500" aria-hidden="true" />
            <h1 className="text-lg font-bold text-slate-900">{t('auth.verify.okTitle')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('auth.verify.okSubtitle')}</p>
            <Link href="/" className="mt-4 inline-block text-sm text-primary-600 hover:underline">{t('auth.verify.goHome')}</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <i className="fa-solid fa-circle-exclamation mb-3 block text-3xl text-rose-500" aria-hidden="true" />
            <h1 className="text-lg font-bold text-rose-600">{t('auth.verify.failed')}</h1>
            <p className="mt-2 text-sm text-slate-500">{message}</p>
            <Link href="/" className="mt-4 inline-block text-sm text-primary-600 hover:underline">{t('auth.verify.backHome')}</Link>
          </>
        )}
      </div>
    </div>
  )
}
