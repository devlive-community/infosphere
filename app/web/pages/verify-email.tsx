import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Loading } from '@/components/ui'
import Seo from '@/components/Seo'

// 邮箱激活落地页：凭链接中的一次性令牌激活邮箱。
export default function VerifyEmail() {
  const router = useRouter()
  const { site, refreshUser } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!router.isReady) return
    const token = typeof router.query.token === 'string' ? router.query.token : ''
    if (!token) {
      setStatus('error')
      setMessage('激活链接缺少令牌，请从邮件中重新打开')
      return
    }
    api('/auth/email/verify', { method: 'POST', body: { token } })
      .then(() => {
        setStatus('ok')
        refreshUser?.().catch(() => { /* 未登录则忽略 */ })
      })
      .catch((e) => {
        setStatus('error')
        setMessage((e as Error).message || '激活失败')
      })
  }, [router.isReady, router.query.token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
      <Seo siteName={siteName} title="邮箱激活" noindex />
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {status === 'loading' && <Loading className="py-6" label="正在激活邮箱…" />}
        {status === 'ok' && (
          <>
            <i className="fa-solid fa-circle-check mb-3 block text-3xl text-emerald-500" aria-hidden="true" />
            <h1 className="text-lg font-bold text-slate-900">邮箱已激活</h1>
            <p className="mt-2 text-sm text-slate-500">现在你可以创建书籍、发表评论等全部功能。</p>
            <Link href="/" className="mt-4 inline-block text-sm text-primary-600 hover:underline">进入首页</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <i className="fa-solid fa-circle-exclamation mb-3 block text-3xl text-rose-500" aria-hidden="true" />
            <h1 className="text-lg font-bold text-rose-600">激活失败</h1>
            <p className="mt-2 text-sm text-slate-500">{message}</p>
            <Link href="/" className="mt-4 inline-block text-sm text-primary-600 hover:underline">返回首页</Link>
          </>
        )}
      </div>
    </div>
  )
}
