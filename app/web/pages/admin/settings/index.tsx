import { useEffect } from 'react'
import { useRouter } from 'next/router'

// /admin/settings 默认跳转到首个 Tab（站点设置）
export default function SettingsIndex() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/settings/site') }, [router])
  return null
}
