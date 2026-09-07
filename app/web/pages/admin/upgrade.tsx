import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import { Button, Badge } from '@/components/ui'
import { SystemVersion } from '@/lib/admin'

// 版本更新：版本信息与在线升级（仅管理员）
export default function AdminUpgrade() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [info, setInfo] = useState<SystemVersion | null>(null)
  const [message, setMessage] = useState('')
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    api<SystemVersion>('/system/version').then(setInfo).catch((e) => setMessage((e as Error).message))
  }, [isAdmin])

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

  return (
    <AdminLayout current="upgrade" breadcrumb="版本更新">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">版本更新</h1>
        <p className="mt-1.5 text-sm text-slate-500">查看当前版本并从 GitHub Releases 拉取升级，升级前会自动备份当前版本。</p>
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">版本信息</h2>
          {info ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">当前版本</dt>
                <dd className="font-mono font-semibold">v{info.version}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">构建提交</dt>
                <dd className="font-mono text-xs">{info.commit}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">最新版本</dt>
                <dd>
                  {info.latest
                    ? <a href={info.latest.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary-600 hover:underline">v{info.latest.version}（查看发布说明）</a>
                    : <span className="text-slate-400">获取中 / 不可用</span>}
                </dd>
              </div>
              <div className="flex items-center justify-between pt-1">
                <dt className="text-slate-500">升级状态</dt>
                <dd>{info.update_available ? <Badge tone="amber">有新版本可升级</Badge> : <Badge tone="emerald">已是最新</Badge>}</dd>
              </div>
            </dl>
          ) : <p className="text-sm text-slate-400">加载中…</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-900">在线升级</h2>
          <p className="mb-4 text-sm text-slate-500">
            从 GitHub Releases 拉取最新版本，自动完成后端二进制与前端资源的替换并重启服务。升级前会自动备份当前版本。
          </p>
          {message && <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
          <Button onClick={upgrade} disabled={!info?.update_available} loading={upgrading}>
            {info?.update_available || upgrading ? '立即升级' : '暂无可升级版本'}
          </Button>
        </section>
      </div>
    </AdminLayout>
  )
}
