import { useState, FormEvent , Fragment } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth , useApp} from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Button, Loading } from '@/components/ui'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import TwoFactorSettings from '@/components/TwoFactorSettings'
import { CalendarIcon, CheckCircleSmallIcon, HistoryIcon, ShieldIcon, UserCircleIcon } from '@/components/icons'

export default function Security() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { t } = useTranslation()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  if (!user) return <Loading className="min-h-[60vh]" label={t('user.security.loading')} />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    if (newPassword !== confirm) return setError(t('user.security.passwordMismatch'))
    setSaving(true)
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: { old_password: oldPassword, new_password: newPassword },
      })
      setMessage(t('user.security.passwordUpdated'))
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // 密码强度：0-4（长度 + 字符种类）
  const strength = (() => {
    if (!newPassword) return 0
    let score = 0
    if (newPassword.length >= 6) score += 1
    if (newPassword.length >= 10) score += 1
    if (/[a-zA-Z]/.test(newPassword) && /\d/.test(newPassword)) score += 1
    if (/[^a-zA-Z0-9]/.test(newPassword)) score += 1
    return Math.min(score, 4)
  })()
  const strengthMeta = [
    { label: t('user.security.strengthTooShort'), color: 'bg-slate-200' },
    { label: t('user.security.strengthWeak'), color: 'bg-rose-400' },
    { label: t('user.security.strengthFair'), color: 'bg-amber-400' },
    { label: t('user.security.strengthGood'), color: 'bg-emerald-400' },
    { label: t('user.security.strengthStrong'), color: 'bg-emerald-500' },
  ][strength]
  const meetsLength = newPassword.length >= 6
  const meetsMixed = /[a-zA-Z]/.test(newPassword) && /\d/.test(newPassword)

  function passwordField(value: string, onChange: (v: string) => void, shown: boolean, toggle: () => void, placeholder: string) {
    return (
      <div className="relative">
        <input type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-primary-500 focus:outline-none"
          style={{ height: 'var(--control-height)' }} />
        <button type="button" onClick={toggle} aria-label={shown ? t('user.security.hidePassword') : t('user.security.showPassword')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {shown
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M9.88 9.88a3 3 0 1 0 4.24 2.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>}
        </button>
      </div>
    )
  }

  return (
    <>
      <Seo siteName={siteName} title={t('user.security.title')} noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">{t('user.security.home')}</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">{t('user.security.title')}</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">{t('user.security.title')}</h1>
          <p className="mt-2 text-[15px] text-slate-500">{t('user.security.description')}</p>
        </div>

        <AccountSettingsLayout user={user} active="security">
          {/* 账户概览 */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{t('user.security.accountOverview')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('user.security.accountOverviewHint')}</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <CheckCircleSmallIcon className="h-4 w-4" /> {t('user.security.accountStatusNormal')}
              </span>
            </div>
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex items-center gap-3 p-5">
                <UserCircleIcon className="h-6 w-6 text-ink" />
                <div>
                  <div className="text-xs text-slate-400">{t('user.security.username')}</div>
                  <div className="font-medium text-slate-900">{user.username}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-5">
                <CalendarIcon className="h-6 w-6 text-ink" />
                <div>
                  <div className="text-xs text-slate-400">{t('user.security.registeredAt')}</div>
                  <div className="font-medium text-slate-900">{formatDate(user.created_at).slice(0, 10)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-5">
                <HistoryIcon className="h-6 w-6 text-ink" />
                <div>
                  <div className="text-xs text-slate-400">{t('user.security.lastLogin')}</div>
                  <div className="font-medium text-slate-900">{formatDate(user.last_login_at) || t('user.security.firstLogin')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 修改密码 */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-bold text-slate-900">{t('user.security.changePassword')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('user.security.changePasswordHint')}</p>
            </div>

            <form onSubmit={submit}>
              <div className="space-y-5 px-6">
                {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
                {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

                <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-700">
                  {t('user.security.passwordChangeWarning')}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
                  <label className="text-sm font-medium text-slate-700">{t('user.security.currentPassword')}</label>
                  {passwordField(oldPassword, setOldPassword, showOld, () => setShowOld(!showOld), t('user.security.currentPasswordPlaceholder'))}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
                  <label className="pt-2.5 text-sm font-medium text-slate-700">{t('user.security.newPassword')}</label>
                  <div>
                    {passwordField(newPassword, setNewPassword, showNew, () => setShowNew(!showNew), t('user.security.newPasswordPlaceholder'))}
                    {/* 强度条 */}
                    {newPassword && (
                      <div className="mt-2.5">
                        <div className="flex gap-1.5">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < strength ? strengthMeta.color : 'bg-slate-100'}`} />
                          ))}
                          <span className="ml-2 text-xs text-slate-500">{t('user.security.passwordStrength')}：<b className={strength >= 3 ? 'text-emerald-600' : strength === 2 ? 'text-amber-600' : 'text-rose-500'}>{strengthMeta.label}</b></span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                          <span className={`flex items-center gap-1 ${meetsLength ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {meetsLength ? <CheckCircleSmallIcon className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />} {t('user.security.minLength')}
                          </span>
                          <span className={`flex items-center gap-1 ${meetsMixed ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {meetsMixed ? <CheckCircleSmallIcon className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />} {t('user.security.mixedCase')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
                  <label className="text-sm font-medium text-slate-700">{t('user.security.confirmPassword')}</label>
                  {passwordField(confirm, setConfirm, showConfirm, () => setShowConfirm(!showConfirm), t('user.security.confirmPasswordPlaceholder'))}
                </div>
              </div>

              {/* 底部操作 */}
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
                <span className="flex items-center gap-2 text-sm text-slate-400">
                  <ShieldIcon className="h-4 w-4" /> {t('user.security.encryptedSave')}
                </span>
                <div className="flex items-center gap-3">
                  <Button variant="outline" type="button" onClick={() => { setOldPassword(''); setNewPassword(''); setConfirm('') }}>{t('user.security.cancel')}</Button>
                  <Button type="submit" loading={saving}>{t('user.security.updatePassword')}</Button>
                </div>
              </div>
            </form>
          </div>

          <TwoFactorSettings />
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
