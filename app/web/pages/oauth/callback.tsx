import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Loading } from '@/components/ui'
import Seo from '@/components/Seo'
import type { User } from '@/lib/types'

// OAuth 回调落地页：API 端完成第三方登录后携带一次性令牌回跳至此，
// 校验 /auth/me 后写入本地会话再进入站点
export default function OAuthCallback() {
  const router = useRouter()
  const { site, login } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [error, setError] = useState('')

  useEffect(() => {
    if (!router.isReady) return
    const token = typeof router.query.token === 'string' ? router.query.token : ''
    if (!token) {
      setError('登录回跳缺少令牌，请重新登录')
      return
    }
    api<User>('/auth/me', { token })
      .then((u) => {
        login(token, u)
        router.replace('/')
      })
      .catch(() => setError('登录令牌校验失败，请重新登录'))
  }, [router.isReady, router.query.token, login, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
      <Seo siteName={siteName} title="第三方登录" noindex />
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm w-full max-w-sm p-8 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-rose-600">登录失败</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Link href="/login" className="mt-4 inline-block text-sm text-primary-600 hover:underline">返回登录页</Link>
          </>
        ) : (
          <>
            <Loading className="py-6" label="登录成功，正在进入…" />
          </>
        )}
      </div>
    </div>
  )
}
