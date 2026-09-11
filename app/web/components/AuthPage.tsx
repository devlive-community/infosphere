import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { FormEvent, useEffect, useState } from 'react'
import OAuthButtons, { oauthErrorText } from '@/components/OAuthButtons'
import { Button, Field, Input, SegmentedTabs, Tooltip } from '@/components/ui'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import type { User } from '@/lib/types'

type AuthMode = 'login' | 'register'

function safeNextPath(next: string | string[] | undefined): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/'
}

function FieldIcon({ name }: { name: 'user' | 'envelope' | 'lock' }) {
  return <i className={`fa-solid fa-${name} w-4 text-center text-xs`} aria-hidden="true" />
}

function PasswordInput({ value, onChange, autoComplete }: {
  value: string
  onChange: (value: string) => void
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <Input
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      minLength={6}
      required
      leading={<FieldIcon name="lock" />}
      trailing={(
        <Tooltip content={visible ? '隐藏密码' : '显示密码'}>
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="flex items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
            style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}
            aria-label={visible ? '隐藏密码' : '显示密码'}
            aria-pressed={visible}
          >
            <i className={`fa-solid ${visible ? 'fa-eye-slash' : 'fa-eye'} text-sm`} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    />
  )
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const { user, login, site } = useApp()
  const siteName = site.site_name?.trim() || ''
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', inviteCode: '' })
  const [regInfo, setRegInfo] = useState<{ mode: string; require_email: boolean } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isLogin = mode === 'login'
  const nextPath = safeNextPath(router.query.next)
  const nextQuery = nextPath === '/' ? '' : `?next=${encodeURIComponent(nextPath)}`

  useEffect(() => setError(''), [mode])

  // 注册方式/邮箱要求：决定是否显示邀请码、邮箱是否必填、是否关闭注册
  useEffect(() => {
    api<{ mode: string; require_email: boolean }>('/auth/registration')
      .then(setRegInfo)
      .catch(() => setRegInfo({ mode: 'open', require_email: false }))
  }, [])

  useEffect(() => {
    if (user && router.isReady) router.replace(safeNextPath(router.query.next))
  }, [user, router])

  useEffect(() => {
    if (router.isReady && typeof router.query.oauth_error === 'string') {
      setError(oauthErrorText(router.query.oauth_error))
    }
  }, [router.isReady, router.query.oauth_error])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!isLogin && form.password !== form.confirm) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const data = isLogin
        ? await api<{ token: string; user: User }>('/auth/login', {
          method: 'POST',
          body: { username: form.username, password: form.password },
        })
        : await api<{ token: string; user: User }>('/auth/register', {
          method: 'POST',
          body: { username: form.username, email: form.email, password: form.password, invite_code: form.inviteCode },
        })
      login(data.token, data.user)
      router.replace(nextPath)
    } catch (submitError) {
      setError((submitError as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const inviteRequired = regInfo?.mode === 'invite' || regInfo?.mode === 'open_invite'
  const emailRequired = !!regInfo?.require_email
  const registrationClosed = !isLogin && regInfo?.mode === 'closed'
  const showInvite = !isLogin && regInfo != null && regInfo.mode !== 'closed'

  const pageTitle = siteName
    ? `${isLogin ? '登录' : '注册'} - ${siteName}`
    : isLogin ? '登录' : '注册'

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-slate-900">
      <Head><title>{pageTitle}</title></Head>

      <header className="border-b border-slate-200/80 bg-white/75 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={siteName ? `返回 ${siteName} 首页` : '返回首页'}>
            <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
            {siteName && <span className="truncate text-lg font-semibold tracking-tight text-slate-900">{siteName}</span>}
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary-600">
            返回首页
            <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)] lg:gap-20 lg:py-14">
        <section className="relative hidden min-h-[570px] overflow-hidden rounded-2xl border border-slate-200/80 bg-[#fbfaf7] p-10 lg:flex lg:flex-col lg:justify-between" aria-label="平台介绍">
          <div className="relative z-10 max-w-xl">
            <p className="mb-5 text-sm font-semibold tracking-[0.2em] text-primary-600">KNOWLEDGE, CONNECTED</p>
            <h1 className="text-4xl font-bold leading-[1.25] tracking-tight text-[#172033] xl:text-5xl">
              让知识沉淀，<br />也让灵感流动
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-slate-500">
              将零散的想法整理成体系，在持续写作与阅读中，构建属于自己的知识脉络。
            </p>
          </div>

          <div className="relative z-10 grid max-w-xl grid-cols-3 gap-3">
            {[
              ['fa-book-open', '专注创作', '沉浸式编辑体验'],
              ['fa-diagram-project', '结构清晰', '章节与知识相连'],
              ['fa-shield-halved', '安全可控', '精细的访问权限'],
            ].map(([icon, title, description]) => (
              <div key={title} className="rounded-xl border border-slate-200/80 bg-white/85 p-4 backdrop-blur-sm">
                <i className={`fa-solid ${icon} mb-4 text-primary-500`} aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute -bottom-28 -right-20 h-[390px] w-[430px] opacity-70" aria-hidden="true">
            <div className="absolute left-16 top-28 h-36 w-36 rounded-full border border-primary-200 bg-primary-50/80" />
            <div className="absolute left-32 top-36 h-24 w-24 rounded-full bg-primary-500/90 shadow-[0_18px_55px_rgba(65,105,225,0.25)]" />
            <div className="absolute left-0 top-12 h-4 w-4 rounded-full bg-amber-400" />
            <div className="absolute right-20 top-10 h-5 w-5 rounded-full bg-primary-300" />
            <div className="absolute right-4 top-44 h-3 w-3 rounded-full bg-slate-400" />
            <span className="absolute left-3 top-[72px] h-px w-28 rotate-[25deg] bg-slate-300" />
            <span className="absolute left-[238px] top-[96px] h-px w-24 -rotate-[28deg] bg-slate-300" />
            <span className="absolute left-[246px] top-[206px] h-px w-28 rotate-[12deg] bg-slate-300" />
          </div>
        </section>

        <section className="mx-auto w-full max-w-md" aria-label={isLogin ? '登录账户' : '注册账户'}>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_55px_rgba(23,32,51,0.08)] sm:p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight text-[#172033]">{isLogin ? '欢迎回来' : '创建账户'}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {isLogin
                  ? '登录后继续你的知识旅程'
                  : siteName ? `加入 ${siteName}，开始记录与分享知识` : '创建账户，开始记录与分享知识'}
              </p>
            </div>

            <SegmentedTabs className="mb-6" fullWidth value={mode} ariaLabel="账户入口" items={[
              { value: 'login', label: '登录', href: `/login${nextQuery}` },
              { value: 'register', label: '注册', href: `/register${nextQuery}` },
            ]} />

            {error && (
              <div role="alert" className="mb-5 max-h-28 overflow-y-auto break-words rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-6 text-rose-600">
                {error}
              </div>
            )}

            {registrationClosed ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">
                <i className="fa-solid fa-lock mb-3 block text-2xl text-slate-300" aria-hidden="true" />
                本站当前已关闭注册。如已有账户，请
                <Link href={`/login${nextQuery}`} className="text-primary-600 hover:underline">登录</Link>。
              </div>
            ) : (
            <>
            <form onSubmit={submit} className="space-y-4">
              <Field label={isLogin ? '用户名或邮箱' : '用户名'}>
                <Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}
                  autoComplete="username" placeholder={isLogin ? '请输入用户名或邮箱' : '3-50 位字母、数字或下划线'}
                  minLength={isLogin ? undefined : 3} maxLength={50} required autoFocus={isLogin} leading={<FieldIcon name="user" />} />
              </Field>

              {!isLogin && (
                <Field label="邮箱" hint={emailRequired ? '本站要求绑定邮箱，用于激活账户与找回密码' : '选填，用于找回密码与接收账户通知'}>
                  <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}
                    autoComplete="email" placeholder="name@example.com" required={emailRequired} leading={<FieldIcon name="envelope" />} />
                </Field>
              )}

              <Field label="密码" hint={!isLogin ? '至少 6 位字符' : undefined}>
                <PasswordInput value={form.password} onChange={(password) => setForm({ ...form, password })}
                  autoComplete={isLogin ? 'current-password' : 'new-password'} />
              </Field>

              {!isLogin && (
                <Field label="确认密码">
                  <PasswordInput value={form.confirm} onChange={(confirm) => setForm({ ...form, confirm })} autoComplete="new-password" />
                </Field>
              )}

              {showInvite && (
                <Field label="邀请码" hint={inviteRequired ? '本站需邀请码注册' : '选填，填写他人的邀请码'}>
                  <Input value={form.inviteCode} onChange={(event) => setForm({ ...form, inviteCode: event.target.value.toUpperCase() })}
                    autoComplete="off" placeholder="请输入邀请码" required={inviteRequired}
                    leading={<i className="fa-solid fa-ticket w-4 text-center text-xs" aria-hidden="true" />} />
                </Field>
              )}

              {isLogin && (
                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline">忘记密码？</Link>
                </div>
              )}

              <Button type="submit" className="w-full" loading={loading}>{isLogin ? '登录' : '创建账户'}</Button>
            </form>

            <div className="mt-5"><OAuthButtons label={isLogin ? '登录' : '注册'} /></div>
            </>
            )}

            <p className="mt-6 text-center text-xs leading-5 text-slate-400">
              {isLogin ? '登录即表示你同意遵守本站的使用规范' : '注册即表示你同意遵守本站的使用规范'}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
