import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { FormEvent, useEffect, useState } from 'react'
import OAuthButtons, { oauthErrorKey } from '@/components/OAuthButtons'
import CaptchaField, { CaptchaValue } from '@/components/CaptchaField'
import { Button, Field, Input, SegmentedTabs, Tooltip, Modal } from '@/components/ui'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import type { User } from '@/lib/types'

type AuthMode = 'login' | 'register'

function safeNextPath(next: string | string[] | undefined): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/'
}

function FieldIcon({ name }: { name: 'user' | 'envelope' | 'lock' }) {
  return <i className={`fa-solid fa-${name} w-4 text-center text-xs`} aria-hidden="true" />
}

function PasswordInput({ value, onChange, autoComplete, placeholder }: {
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation()

  return (
    <Input
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      placeholder={placeholder}
      minLength={6}
      required
      leading={<FieldIcon name="lock" />}
      trailing={(
        <Tooltip content={visible ? t('auth.password.hide') : t('auth.password.show')}>
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="flex items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
            style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}
            aria-label={visible ? t('auth.password.hide') : t('auth.password.show')}
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
  const { t } = useTranslation()
  const siteName = site.site_name?.trim() || ''
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', inviteCode: '' })
  const [regInfo, setRegInfo] = useState<{ mode: string; require_email: boolean; password_min_length?: number; password_require_mixed?: boolean } | null>(null)
  const [captcha, setCaptcha] = useState<CaptchaValue>({ id: '', answer: '', required: false })
  const [captchaRefresh, setCaptchaRefresh] = useState(0)
  const [twoFactorNeeded, setTwoFactorNeeded] = useState(false)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [twoFactorError, setTwoFactorError] = useState('')
  const [twoFactorBusy, setTwoFactorBusy] = useState(false)
  const [loginToken, setLoginToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isLogin = mode === 'login'
  const nextPath = safeNextPath(router.query.next)
  const nextQuery = nextPath === '/' ? '' : `?next=${encodeURIComponent(nextPath)}`

  useEffect(() => { setError(''); setTwoFactorNeeded(false); setTwoFactorCode(''); setLoginToken('') }, [mode])

  // 注册方式/邮箱要求：决定是否显示邀请码、邮箱是否必填、是否关闭注册
  useEffect(() => {
    api<{ mode: string; require_email: boolean; password_min_length?: number; password_require_mixed?: boolean }>('/auth/registration')
      .then(setRegInfo)
      .catch(() => setRegInfo({ mode: 'open', require_email: false }))
  }, [])

  useEffect(() => {
    if (user && router.isReady) router.replace(safeNextPath(router.query.next))
  }, [user, router])

  useEffect(() => {
    if (router.isReady && typeof router.query.oauth_error === 'string') {
      const code = router.query.oauth_error
      const provider = typeof router.query.provider === 'string' && router.query.provider ? router.query.provider : t('auth.oautherror.providerFallback')
      setError(t(oauthErrorKey(code), { code, provider }))
    }
  }, [router.isReady, router.query.oauth_error, router.query.provider]) // eslint-disable-line react-hooks/exhaustive-deps

  // 邀请链接：注册页带 ?invite=<码> 时预填邀请码
  useEffect(() => {
    if (!isLogin && router.isReady && typeof router.query.invite === 'string' && router.query.invite) {
      setForm((f) => (f.inviteCode ? f : { ...f, inviteCode: router.query.invite as string }))
    }
  }, [isLogin, router.isReady, router.query.invite])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!isLogin && form.password !== form.confirm) {
      setError(t('auth.register.passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      const data = isLogin
        ? await api<{ token?: string; user?: User; two_factor_required?: boolean; login_token?: string }>('/auth/login', {
          method: 'POST',
          body: { username: form.username, password: form.password, captcha_id: captcha.id, captcha_answer: captcha.answer },
        })
        : await api<{ token: string; user: User }>('/auth/register', {
          method: 'POST',
          body: { username: form.username, email: form.email, password: form.password, invite_code: form.inviteCode, captcha_id: captcha.id, captcha_answer: captcha.answer },
        })
      if (isLogin && (data as { two_factor_required?: boolean }).two_factor_required) {
        // 验证码与密码已通过，弹层输入动态码走第二步（不再携带验证码）
        setLoginToken((data as { login_token?: string }).login_token || '')
        setTwoFactorCode('')
        setTwoFactorError('')
        setTwoFactorNeeded(true)
        setError('')
        return
      }
      login((data as { token: string }).token, (data as { user: User }).user)
      router.replace(nextPath)
    } catch (submitError) {
      setError((submitError as Error).message)
      if (captcha.required) setCaptchaRefresh((n) => n + 1) // 验证码一次性，失败后换新
    } finally {
      setLoading(false)
    }
  }

  // 两步登录第二步：仅凭挑战 token + 动态码，不再校验验证码
  async function verifyTwoFactor(event: FormEvent) {
    event.preventDefault()
    setTwoFactorBusy(true)
    setTwoFactorError('')
    try {
      const data = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { login_token: loginToken, two_factor_code: twoFactorCode.trim() },
      })
      setTwoFactorNeeded(false)
      login(data.token, data.user)
      router.replace(nextPath)
    } catch (e) {
      setTwoFactorError((e as Error).message)
    } finally {
      setTwoFactorBusy(false)
    }
  }

  const inviteRequired = regInfo?.mode === 'invite' || regInfo?.mode === 'open_invite'
  const emailRequired = !!regInfo?.require_email
  const registrationClosed = !isLogin && regInfo?.mode === 'closed'
  const showInvite = !isLogin && regInfo != null && regInfo.mode !== 'closed'

  const authLabel = isLogin ? t('auth.tab.login') : t('auth.tab.register')
  const pageTitle = siteName ? `${authLabel} - ${siteName}` : authLabel

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-slate-900">
      <Head><title>{pageTitle}</title></Head>

      <header className="border-b border-slate-200/80 bg-white/75 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={siteName ? t('auth.aria.homeNamed', { site: siteName }) : t('auth.aria.home')}>
            <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
            {siteName && <span className="truncate text-lg font-semibold tracking-tight text-slate-900">{siteName}</span>}
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary-600">
            {t('auth.link.backHome')}
            <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)] lg:gap-20 lg:py-14">
        <section className="relative hidden min-h-[570px] overflow-hidden rounded-2xl border border-slate-200/80 bg-[#fbfaf7] p-10 lg:flex lg:flex-col lg:justify-between" aria-label={t('auth.aria.intro')}>
          <div className="relative z-10 max-w-xl">
            <p className="mb-5 text-sm font-semibold tracking-[0.2em] text-primary-600">{t('auth.hero.eyebrow')}</p>
            <h1 className="text-4xl font-bold leading-[1.25] tracking-tight text-[#172033] xl:text-5xl">
              {t('auth.hero.titleLine1')}<br />{t('auth.hero.titleLine2')}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-slate-500">
              {t('auth.hero.subtitle')}
            </p>
          </div>

          <div className="relative z-10 grid max-w-xl grid-cols-3 gap-3">
            {[
              ['fa-book-open', t('auth.hero.feature1Title'), t('auth.hero.feature1Desc')],
              ['fa-diagram-project', t('auth.hero.feature2Title'), t('auth.hero.feature2Desc')],
              ['fa-shield-halved', t('auth.hero.feature3Title'), t('auth.hero.feature3Desc')],
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

        <section className="mx-auto w-full max-w-md" aria-label={isLogin ? t('auth.aria.loginSection') : t('auth.aria.registerSection')}>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_55px_rgba(23,32,51,0.08)] sm:p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight text-[#172033]">{isLogin ? t('auth.form.welcomeBack') : t('auth.form.createAccount')}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {isLogin
                  ? t('auth.form.loginSubtitle')
                  : siteName ? t('auth.form.registerSubtitleNamed', { site: siteName }) : t('auth.form.registerSubtitle')}
              </p>
            </div>

            <SegmentedTabs className="mb-6" fullWidth value={mode} ariaLabel={t('auth.tab.aria')} items={[
              { value: 'login', label: t('auth.tab.login'), href: `/login${nextQuery}` },
              { value: 'register', label: t('auth.tab.register'), href: `/register${nextQuery}` },
            ]} />

            {error && (
              <div role="alert" className="mb-5 max-h-28 overflow-y-auto break-words rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-6 text-rose-600">
                {error}
              </div>
            )}

            {registrationClosed ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">
                <i className="fa-solid fa-lock mb-3 block text-2xl text-slate-300" aria-hidden="true" />
                {t('auth.closed.text')}
                <Link href={`/login${nextQuery}`} className="text-primary-600 hover:underline">{t('auth.closed.loginLink')}</Link>{t('auth.closed.suffix')}
              </div>
            ) : (
            <>
            <form onSubmit={submit} className="space-y-4">
              <Field label={isLogin ? t('auth.field.usernameOrEmail') : t('auth.field.username')}>
                <Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}
                  autoComplete="username" placeholder={isLogin ? t('auth.field.usernameOrEmailPlaceholder') : t('auth.field.usernamePlaceholder')}
                  minLength={isLogin ? undefined : 3} maxLength={50} required autoFocus={isLogin} leading={<FieldIcon name="user" />} />
              </Field>

              {!isLogin && (
                <Field label={t('auth.field.email')} hint={emailRequired ? t('auth.field.emailHintRequired') : t('auth.field.emailHintOptional')}>
                  <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}
                    autoComplete="email" placeholder={t('auth.field.emailPlaceholder')} required={emailRequired} leading={<FieldIcon name="envelope" />} />
                </Field>
              )}

              <Field label={t('auth.field.password')} hint={!isLogin ? t(regInfo?.password_require_mixed ? 'auth.field.passwordHintMixed' : 'auth.field.passwordHint', { n: regInfo?.password_min_length ?? 6 }) : undefined}>
                <PasswordInput value={form.password} onChange={(password) => setForm({ ...form, password })}
                  autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder={t('auth.field.passwordPlaceholder')} />
              </Field>

              {!isLogin && (
                <Field label={t('auth.field.confirmPassword')}>
                  <PasswordInput value={form.confirm} onChange={(confirm) => setForm({ ...form, confirm })} autoComplete="new-password" placeholder={t('auth.field.confirmPlaceholder')} />
                </Field>
              )}

              {showInvite && (
                <Field label={t('auth.field.inviteCode')} hint={inviteRequired ? t('auth.field.inviteHintRequired') : t('auth.field.inviteHintOptional')}>
                  <Input value={form.inviteCode} onChange={(event) => setForm({ ...form, inviteCode: event.target.value.toUpperCase() })}
                    autoComplete="off" placeholder={t('auth.field.invitePlaceholder')} required={inviteRequired}
                    leading={<i className="fa-solid fa-ticket w-4 text-center text-xs" aria-hidden="true" />} />
                </Field>
              )}

              {isLogin && (
                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline">{t('auth.login.forgot')}</Link>
                </div>
              )}

              <CaptchaField scene={isLogin ? 'login' : 'register'} onChange={setCaptcha} refreshSignal={captchaRefresh} />

              <Button type="submit" className="w-full" loading={loading}>{isLogin ? t('auth.action.login') : t('auth.action.createAccount')}</Button>
            </form>

            <Modal open={isLogin && twoFactorNeeded} onClose={() => setTwoFactorNeeded(false)} title={t('auth.twofactor.title')}>
              <form onSubmit={verifyTwoFactor} className="space-y-3">
                <p className="text-sm text-slate-500">{t('auth.twofactor.hint')}</p>
                <Input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)}
                  autoComplete="one-time-code" autoFocus placeholder={t('auth.twofactor.placeholder')}
                  leading={<i className="fa-solid fa-shield-halved w-4 text-center text-xs" aria-hidden="true" />} />
                {twoFactorError && <p className="text-sm text-rose-600">{twoFactorError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setTwoFactorNeeded(false)}>{t('common.actions.cancel')}</Button>
                  <Button type="submit" loading={twoFactorBusy} disabled={!twoFactorCode.trim()}>{t('auth.twofactor.verify')}</Button>
                </div>
              </form>
            </Modal>

            <div className="mt-5"><OAuthButtons label={isLogin ? t('auth.tab.login') : t('auth.tab.register')} /></div>
            </>
            )}

            <p className="mt-6 text-center text-xs leading-5 text-slate-400">
              {isLogin ? (
                t('auth.legal.loginNotice')
              ) : site.terms_url || site.privacy_url ? (
                <>
                  {t('auth.legal.registerAgreePrefix')}
                  {site.terms_url && (
                    <a href={site.terms_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{t('auth.legal.terms')}</a>
                  )}
                  {site.terms_url && site.privacy_url && t('auth.legal.and')}
                  {site.privacy_url && (
                    <a href={site.privacy_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{t('auth.legal.privacy')}</a>
                  )}
                </>
              ) : (
                t('auth.legal.registerNotice')
              )}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
