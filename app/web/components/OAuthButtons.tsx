import { useEffect, useState } from 'react'
import { API_BASE, api } from '@/lib/api'
import { Button, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

// icon 为完整 FontAwesome 类名（品牌图标用 fa-brands，无品牌图标的国内平台用 fa-solid）。
const PROVIDER_META: Record<string, { label: string; icon: string }> = {
  github: { label: 'GitHub', icon: 'fa-brands fa-github' },
  google: { label: 'Google', icon: 'fa-brands fa-google' },
  gitlab: { label: 'GitLab', icon: 'fa-brands fa-gitlab' },
  gitee: { label: 'Gitee', icon: 'fa-solid fa-code-branch' },
  gitcode: { label: 'GitCode', icon: 'fa-solid fa-code' },
}

// OAuthButtons 第三方登录入口：拉取启用中的 provider，渲染对应按钮（登录/注册页共用）
export default function OAuthButtons({ label }: { label: string }) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api<{ providers: { provider: string; enabled: boolean }[] }>('/auth/oauth/providers')
      .then((d) => setEnabled((d.providers || []).filter((p) => p.enabled).map((p) => p.provider)))
      .catch(() => { /* providers 拉取失败时不展示入口 */ })
      .finally(() => setLoaded(true))
  }, [])

  if (!loaded) return <Loading className="py-4" label={t('auth.oauth.loading')} />
  if (enabled.length === 0) return null
  return (
    <>
      <div className="flex items-center gap-3 py-1 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />{t('auth.oauth.divider')}<span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="space-y-2">
        {enabled.map((p) => {
          const meta = PROVIDER_META[p] || { label: p, icon: 'fa-solid fa-right-to-bracket' }
          return (
            <Button key={p} variant="outline" type="button" className="w-full"
              onClick={() => {
                window.location.href = `${API_BASE}/api/v1/auth/oauth/${p}?origin=${encodeURIComponent(window.location.origin)}`
              }}>
              <i className={meta.icon} aria-hidden="true" />{t('auth.oauth.button', { provider: meta.label, label })}
            </Button>
          )
        })}
      </div>
    </>
  )
}

const OAUTH_ERROR_CODES = new Set([
  'not_configured', 'invalid_state', 'missing_code', 'provider_unreachable', 'token_exchange_failed',
  'profile_fetch_failed', 'account_disabled', 'register_failed', 'token_issue_failed', 'unsupported_provider',
  'registration_closed', 'registration_invite_required', 'already_bound',
])

// oauthErrorKey 把回调携带的 oauth_error 代码转成 i18n 键（未知代码回退到带占位的通用键）
export function oauthErrorKey(code: string): string {
  return OAUTH_ERROR_CODES.has(code) ? `auth.oautherror.${code}` : 'auth.oautherror.unknown'
}
