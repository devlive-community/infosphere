import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

// /admin/settings 默认跳转到首个 Tab（站点设置）
export default function SettingsIndex() {
  const router = useRouter()
  const { t } = useTranslation()
  useEffect(() => { router.replace('/admin/settings/site') }, [router])
  return <Loading className="min-h-screen" label={t('admin.settings.loading')} />
}
