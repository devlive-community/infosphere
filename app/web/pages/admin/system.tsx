import { useEffect, useState , Fragment } from 'react'
import Seo from '@/components/Seo'
import Container from '@/components/Container'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Badge, Input, Field, Select } from '@/components/ui'

interface SystemVersion {
  version: string
  commit: string
  build_date: string
  update_available: boolean
  latest: { version: string; url: string; published_at: string } | null
}

interface OAuthConfig {
  provider: string
  client_id: string
  client_secret: string
}

// 管理后台：系统状态与在线升级（仅管理员）
export default function AdminSystem() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const { user } = useApp()
  const [info, setInfo] = useState<SystemVersion | null>(null)
  const [message, setMessage] = useState('')
  const [upgrading, setUpgrading] = useState(false)
  const [oauth, setOauth] = useState({ client_id: '', client_secret: '' })
  const [oauthEnabled, setOauthEnabled] = useState('false')
  const [oauthMessage, setOauthMessage] = useState('')
  const [oauthSaving, setOauthSaving] = useState(false)
  const [siteOrigin, setSiteOrigin] = useState('')
  const isAdmin = user?.role === 'admin'

  async function load() {
    try {
      setInfo(await api<SystemVersion>('/system/version'))
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  async function loadOAuth() {
    try {
      const cfg = await api<OAuthConfig>('/oauth')
      setOauth({ client_id: cfg.client_id || '', client_secret: cfg.client_secret || '' })
      setOauthEnabled(cfg.client_id && cfg.client_secret ? 'true' : 'false')
    } catch { /* 配置读取失败保持默认 */ }
  }
  useEffect(() => {
    if (!isAdmin) return
    load()
    loadOAuth()
    setSiteOrigin(window.location.origin)
  } /* eslint-disable-line react-hooks/exhaustive-deps */, [isAdmin])

  async function saveOAuth() {
    setOauthSaving(true)
    setOauthMessage('')
    try {
      await api('/oauth', {
        method: 'PUT',
        body: { client_id: oauth.client_id, client_secret: oauth.client_secret, enabled: oauthEnabled === 'true' },
      })
      setOauthMessage('GitHub 登录配置已保存')
    } catch (e) {
      setOauthMessage((e as Error).message)
    } finally {
      setOauthSaving(false)
    }
  }

  async function upgrade() {
    if (!confirm('将下载最新版本并自动重启服务，继续？')) return
    setUpgrading(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/system/upgrade', { method: 'POST' })
      setMessage(result.message || '升级完成，服务正在重启，页面稍后将自动刷新。')
      setTimeout(() => window.location.reload(), 8000)
    } catch (e) {
      setMessage((e as Error).message)
      setUpgrading(false)
    }
  }

  if (!user) return <p className="py-20 text-center text-slate-400">请先登录</p>
  if (!isAdmin) return <p className="py-20 text-center text-slate-400">仅管理员可访问</p>

  return (
    <>
      <Seo siteName={siteName} title="系统管理" noindex />
      <Container>
      <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-slate-900">系统管理</h1>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-6 p-6">
        <h2 className="mb-3 font-semibold text-slate-900">版本信息</h2>
        {info ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-400">当前版本</dt>
              <dd className="font-mono font-semibold">v{info.version}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-400">构建提交</dt>
              <dd className="font-mono text-xs">{info.commit}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-400">最新版本</dt>
              <dd>
                {info.latest ? (
                  <a href={info.latest.url} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-xs text-primary-600 hover:underline">v{info.latest.version}（查看发布说明）</a>
                ) : <span className="text-slate-400">获取中 / 不可用</span>}
              </dd>
            </div>
            <div className="flex items-center justify-between pt-1">
              <dt className="text-slate-400">升级状态</dt>
              <dd>
                {info.update_available
                  ? <Badge tone="amber">有新版本可升级</Badge>
                  : <Badge tone="emerald">已是最新</Badge>}
              </dd>
            </div>
          </dl>
        ) : <p className="text-sm text-slate-400">加载中…</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-6 p-6">
        <h2 className="mb-2 font-semibold text-slate-900">第三方登录（GitHub OAuth）</h2>
        <p className="mb-4 text-sm text-slate-500">
          在 GitHub「Developer settings → OAuth Apps」创建应用后填入凭据，
          回调地址填写 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{siteOrigin || 'https://你的站点'}/api/v1/auth/oauth/github/callback</code>。
        </p>
        <div className="space-y-4">
          <Field label="Client ID">
            <Input value={oauth.client_id} onChange={(e) => setOauth({ ...oauth, client_id: e.target.value })}
              placeholder="GitHub OAuth App Client ID" />
          </Field>
          <Field label="Client Secret">
            <Input type="password" value={oauth.client_secret} onChange={(e) => setOauth({ ...oauth, client_secret: e.target.value })}
              placeholder="GitHub OAuth App Client Secret" />
          </Field>
          <Field label="启用状态" hint="停用后登录/注册页不再显示 GitHub 入口">
            <Select
              options={[{ value: 'true', label: '启用' }, { value: 'false', label: '停用' }]}
              value={oauthEnabled} onChange={setOauthEnabled} />
          </Field>
        </div>
        {oauthMessage && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{oauthMessage}</div>}
        <div className="mt-4 flex justify-end">
          <Button loading={oauthSaving} onClick={saveOAuth}>保存配置</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <h2 className="mb-2 font-semibold text-slate-900">在线升级</h2>
        <p className="mb-4 text-sm text-slate-500">
          从 GitHub Releases 拉取最新版本，自动完成后端二进制与前端资源的替换并重启服务。
          升级前会自动备份当前版本。
        </p>
        {message && <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <Button onClick={upgrade} disabled={!info?.update_available} loading={upgrading}>
          {info?.update_available || upgrading ? '立即升级' : '暂无可升级版本'}
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        <Link href="/" className="hover:underline">返回首页</Link>
      </p>
    </div>
    </Container>
  </>
  )
}
