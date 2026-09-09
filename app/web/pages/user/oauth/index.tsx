import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Loading } from '@/components/ui'
import OAuthBindings from '@/components/OAuthBindings'

export default function OAuthSettings() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载账户设置…" />

  return (
    <>
      <Seo siteName={siteName} title="第三方账号" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <Link href="/user/profile" className="hover:text-primary-600">账户设置</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">第三方账号</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">第三方账号</h1>
          <p className="mt-2 text-[15px] text-slate-500">管理第三方账号绑定，支持多种登录方式。</p>
        </div>

        <AccountSettingsLayout user={user} active="oauth">
          <OAuthBindings />
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
