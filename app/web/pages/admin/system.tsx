import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'

interface SystemVersion {
  version: string
  commit: string
  build_date: string
  update_available: boolean
  latest: { version: string; url: string; published_at: string } | null
}

// 管理后台：系统状态与在线升级（仅管理员）
export default function AdminSystem() {
  const { user } = useApp()
  const [info, setInfo] = useState<SystemVersion | null>(null)
  const [message, setMessage] = useState('')
  const [upgrading, setUpgrading] = useState(false)
  const isAdmin = user?.role === 'admin'

  async function load() {
    try {
      setInfo(await api<SystemVersion>('/system/version'))
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  useEffect(() => { if (isAdmin) load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [isAdmin])

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
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-slate-900">系统管理</h1>

      <div className="card mb-6 p-6">
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
                  ? <span className="badge bg-amber-50 text-amber-600">有新版本可升级</span>
                  : <span className="badge bg-emerald-50 text-emerald-600">已是最新</span>}
              </dd>
            </div>
          </dl>
        ) : <p className="text-sm text-slate-400">加载中…</p>}
      </div>

      <div className="card p-6">
        <h2 className="mb-2 font-semibold text-slate-900">在线升级</h2>
        <p className="mb-4 text-sm text-slate-500">
          从 GitHub Releases 拉取最新版本，自动完成后端二进制与前端资源的替换并重启服务。
          升级前会自动备份当前版本。
        </p>
        {message && <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <button className="btn-primary" disabled={!info?.update_available || upgrading} onClick={upgrade}>
          {upgrading ? '升级中，请勿关闭页面…' : info?.update_available ? '立即升级' : '暂无可升级版本'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        <Link href="/" className="hover:underline">返回首页</Link>
      </p>
    </div>
  )
}
