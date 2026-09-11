import { ReactNode } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { SegmentedTabs } from '@/components/ui'

export type SettingsTab = 'site' | 'registration' | 'captcha' | 'storage' | 'mail' | 'oauth'

const TABS: { key: SettingsTab; label: string; href: string }[] = [
  { key: 'site', label: '站点设置', href: '/admin/settings/site' },
  { key: 'registration', label: '注册设置', href: '/admin/settings/registration' },
  { key: 'captcha', label: '验证码', href: '/admin/settings/captcha' },
  { key: 'storage', label: '存储配置', href: '/admin/settings/storage' },
  { key: 'mail', label: '邮件服务', href: '/admin/settings/mail' },
  { key: 'oauth', label: '第三方登录', href: '/admin/settings/oauth' },
]

interface SettingsLayoutProps {
  active: SettingsTab
  description: string
  children: ReactNode
}

// SettingsLayout 系统设置：统一标题 + 横向 Tab 导航（每个 Tab 独立 URL），承载各配置表单
export default function SettingsLayout({ active, description, children }: SettingsLayoutProps) {
  return (
    <AdminLayout current="settings" breadcrumb="系统设置">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">系统设置</h1>
        <p className="mt-1.5 text-sm text-slate-500">{description}</p>
      </div>

      <SegmentedTabs className="mb-6" value={active} ariaLabel="系统设置分类"
        items={TABS.map((tab) => ({ value: tab.key, label: tab.label, href: tab.href }))} />

      {children}
    </AdminLayout>
  )
}
