import { useEffect, useState } from 'react'
import { API_BASE, api } from '@/lib/api'
import { GithubIcon } from '@/components/icons'
import { Button } from '@/components/ui'

// OAuthButtons 第三方登录入口：拉取启用中的 provider，渲染对应按钮（登录/注册页共用）
export default function OAuthButtons({ label }: { label: string }) {
  const [githubEnabled, setGithubEnabled] = useState(false)

  useEffect(() => {
    api<{ providers: { provider: string; enabled: boolean }[] }>('/auth/oauth/providers')
      .then((d) => setGithubEnabled(!!d.providers?.some((p) => p.provider === 'github' && p.enabled)))
      .catch(() => { /* providers 拉取失败时不展示入口 */ })
  }, [])

  if (!githubEnabled) return null
  return (
    <>
      <div className="flex items-center gap-3 py-1 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />或<span className="h-px flex-1 bg-slate-200" />
      </div>
      <Button variant="outline" type="button" className="w-full"
        onClick={() => {
          window.location.href = `${API_BASE}/api/v1/auth/oauth/github?origin=${encodeURIComponent(window.location.origin)}`
        }}>
        <GithubIcon className="h-4 w-4" />使用 GitHub {label}
      </Button>
    </>
  )
}

// oauthErrorText 把回调携带的 oauth_error 代码转成可读文案
export function oauthErrorText(code: string): string {
  const messages: Record<string, string> = {
    not_configured: '管理员尚未配置 GitHub 登录',
    invalid_state: '登录状态校验失败，请重新尝试',
    missing_code: '未获取到授权码，请重新尝试',
    provider_unreachable: '无法连接 GitHub，请稍后重试',
    token_exchange_failed: 'GitHub 授权换取失败，请重试',
    profile_fetch_failed: '获取 GitHub 账号信息失败，请重试',
    account_disabled: '该账户已被禁用',
    register_failed: '自动创建账户失败，请稍后重试',
    token_issue_failed: '签发登录令牌失败，请重试',
    unsupported_provider: '不支持的第三方登录方式',
  }
  return messages[code] || `第三方登录失败（${code}）`
}
