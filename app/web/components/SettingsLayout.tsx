import { ReactNode } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { SegmentedTabs } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

export type SettingsTab = 'site' | 'footer' | 'registration' | 'captcha' | 'login-security' | 'content' | 'storage' | 'mail' | 'oauth' | 'translation' | 'languages'

interface SettingsLayoutProps {
  active: SettingsTab
  description: string
  children: ReactNode
}

// SettingsLayout 系统设置：统一标题 + 横向 Tab 导航（每个 Tab 独立 URL），承载各配置表单
export default function SettingsLayout({ active, description, children }: SettingsLayoutProps) {
  const { t } = useTranslation()

  const TABS: { key: SettingsTab; labelKey: string; href: string }[] = [
    { key: 'languages', labelKey: 'i18n.title', href: '/admin/settings/languages' },
    { key: 'site', labelKey: 'admin.settings.site', href: '/admin/settings/site' },
    { key: 'footer', labelKey: 'admin.settings.footer', href: '/admin/settings/footer' },
    { key: 'registration', labelKey: 'admin.settings.registration', href: '/admin/settings/registration' },
    { key: 'captcha', labelKey: 'admin.settings.captcha', href: '/admin/settings/captcha' },
    { key: 'login-security', labelKey: 'admin.settings.loginSecurity', href: '/admin/settings/login-security' },
    { key: 'content', labelKey: 'admin.settings.content', href: '/admin/settings/content' },
    { key: 'storage', labelKey: 'admin.settings.storage', href: '/admin/settings/storage' },
    { key: 'mail', labelKey: 'admin.settings.mail', href: '/admin/settings/mail' },
    { key: 'translation', labelKey: 'admin.settings.translation', href: '/admin/settings/translation' },
    { key: 'oauth', labelKey: 'admin.settings.oauth', href: '/admin/settings/oauth' },
  ]

  return (
    <AdminLayout current="settings" breadcrumb={t('admin.nav.settings')}>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.settings.title')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{description}</p>
      </div>

      <SegmentedTabs className="mb-6" value={active} ariaLabel={t('admin.settings.ariaLabel')}
        items={TABS.map((tab) => ({ value: tab.key, label: t(tab.labelKey), href: tab.href }))} />

      {children}
    </AdminLayout>
  )
}
