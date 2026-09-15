import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { useRequireAuth, useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Loading } from '@/components/ui'
import OAuthBindings from '@/components/OAuthBindings'

export default function OAuthSettings() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { t } = useTranslation()

  if (!user) return <Loading className="min-h-[60vh]" label={t('user.oauth.loading')} />

  return (
    <>
      <Seo siteName={siteName} title={t('user.oauth.title')} noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">{t('user.oauth.home')}</Link>
          <span className="text-slate-300">/</span>
          <Link href="/user/profile" className="hover:text-primary-600">{t('user.oauth.accountSettings')}</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">{t('user.oauth.title')}</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">{t('user.oauth.title')}</h1>
          <p className="mt-2 text-[15px] text-slate-500">{t('user.oauth.description')}</p>
        </div>

        <AccountSettingsLayout user={user} active="oauth">
          <OAuthBindings />
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
