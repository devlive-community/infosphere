import Link from 'next/link'
import { ReactNode } from 'react'
import AdminLayout from '@/components/AdminLayout'

export type SettingsTab = 'site' | 'storage' | 'mail' | 'oauth' | 'config'

const TABS: { key: SettingsTab; label: string; href: string }[] = [
  { key: 'site', label: '站点设置', href: '/admin/settings/site' },
  { key: 'storage', label: '存储配置', href: '/admin/settings/storage' },
  { key: 'mail', label: '邮件服务', href: '/admin/settings/mail' },
  { key: 'oauth', label: '第三方登录', href: '/admin/settings/oauth' },
  { key: 'config', label: '系统配置', href: '/admin/settings/config' },
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

      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const on = t.key === active
            return (
              <Link key={t.key} href={t.href}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  on ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}>
                {t.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {children}
    </AdminLayout>
  )
}
