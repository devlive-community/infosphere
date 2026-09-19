import { ReactNode } from 'react'
import { ButtonLink, Loading } from '@/components/ui'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'

// FeatureGate 特性插件页面守卫：插件禁用时该独立页面渲染 404（而非空态/报错）。
// feature 传插件 key（如 'tags' / 'achievements'）；启用状态取自公开站点配置的 feature_plugins。
export default function FeatureGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { site, authReady } = useApp()
  const { t } = useTranslation()
  const enabled = (site.feature_plugins || []).includes(feature)

  if (!authReady) return <Loading className="min-h-[60vh]" />
  if (!enabled) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-slate-50">
        <h1 className="text-6xl font-bold text-slate-300">404</h1>
        <p className="mt-4 text-slate-500">{t('error.notfound.message')}</p>
        <ButtonLink href="/">{t('error.notfound.backHome')}</ButtonLink>
      </div>
    )
  }
  return <>{children}</>
}
