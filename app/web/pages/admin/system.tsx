import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import { Badge, ButtonLink } from '@/components/ui'
import {
  ShieldCheckIcon, TagIcon, DatabaseIcon, CodeIcon, GlobeIcon, ServerIcon,
  ActivityIcon, ExternalLinkIcon, MailIcon, GithubIcon, UsersIcon,
  BookIcon, FileTextIcon, EyeIcon,
} from '@/components/icons'
import {
  SystemVersion, HealthInfo, MailConfig, StorageConfig, OAuthConfig,
  fetchHealth, measure,
} from '@/lib/admin'

interface Service { key: string; label: string; icon: (p: { className?: string }) => JSX.Element; ok: boolean; latency: number }

const DB_LABEL: Record<string, string> = { sqlite: 'SQLite', mysql: 'MySQL', postgres: 'PostgreSQL' }

// 管理控制台首页：服务状态总览与配置入口（仅管理员）
export default function AdminSystem() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [version, setVersion] = useState<SystemVersion | null>(null)
  const [dbType, setDbType] = useState('')
  const [services, setServices] = useState<Service[] | null>(null)
  const [storage, setStorage] = useState<StorageConfig | null>(null)
  const [mail, setMail] = useState<MailConfig | null>(null)
  const [oauth, setOauth] = useState<OAuthConfig | null>(null)
  const [userCount, setUserCount] = useState<number | null>(null)
  const [bookCount, setBookCount] = useState<number | null>(null)
  const [docCount, setDocCount] = useState<number | null>(null)
  const [totalViews, setTotalViews] = useState<number | null>(null)
  const [tagCount, setTagCount] = useState<number | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    fetchHealth().then(async ({ health, latency }) => {
      setHealth(health)
      const [webMs, dbMs] = await Promise.all([measure('/', { method: 'HEAD' }), measure('/api/v1/stats')])
      setServices([
        { key: 'api', label: 'API 服务', icon: ServerIcon, ok: health.status === 'ok', latency },
        { key: 'web', label: 'Web SSR', icon: GlobeIcon, ok: health.web !== 'down', latency: webMs },
        { key: 'db', label: '数据库连接', icon: DatabaseIcon, ok: health.db === 'up', latency: dbMs },
      ])
    }).catch(() => { /* 健康检查失败时保持加载态 */ })
    api<SystemVersion>('/system/version').then(setVersion).catch(() => {})
    api<{ db_type?: string }>('/setup/status').then((s) => setDbType(s.db_type || '')).catch(() => {})
    api<StorageConfig>('/storage').then(setStorage).catch(() => {})
    api<MailConfig>('/mail').then(setMail).catch(() => {})
    api<OAuthConfig>('/oauth').then(setOauth).catch(() => {})
    api<{ user_count: number; book_count: number; document_count: number; tag_count: number; total_views: number }>('/stats')
      .then((s) => {
        setUserCount(s.user_count)
        setBookCount(s.book_count)
        setDocCount(s.document_count)
        setTagCount(s.tag_count)
        setTotalViews(s.total_views)
      }).catch(() => {})
  }, [isAdmin])

  const dbName = DB_LABEL[dbType] || dbType || '—'
  const nodeVer = health?.node ? `Node.js ${health.node.replace(/^v/, '')}` : '—'
  const healthy = health?.status === 'ok'

  return (
    <AdminLayout current="system" breadcrumb="系统概览">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">控制台</h1>
          <p className="mt-1.5 text-sm text-slate-500">集中查看服务状态并维护站点运行配置</p>
        </div>
        <ButtonLink href="/" variant="outline">
          <ExternalLinkIcon className="h-4 w-4" /> 查看站点
        </ButtonLink>
      </div>

      {/* 内容统计卡片 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UsersIcon} tone="primary" label="用户" value={fmtNum(userCount)} />
        <StatCard icon={BookIcon} tone="sky" label="书籍" value={fmtNum(bookCount)} />
        <StatCard icon={FileTextIcon} tone="violet" label="文档" value={fmtNum(docCount)} />
        <StatCard icon={EyeIcon} tone="amber" label="累计浏览" value={fmtNum(totalViews)} />
      </div>

      {/* 运行环境卡片 */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldCheckIcon} tone="emerald" label="系统状态"
          value={healthy ? '运行正常' : '异常'} valueClass={healthy ? 'text-emerald-600' : 'text-rose-600'}
          dot={healthy ? 'bg-emerald-500' : 'bg-rose-500'} />
        <StatCard icon={TagIcon} tone="violet" label="当前版本" value={health ? `v${health.version}` : '—'} />
        <StatCard icon={DatabaseIcon} tone="sky" label="数据库" value={dbName} />
        <StatCard icon={CodeIcon} tone="primary" label="Web 运行时" value={nodeVer} />
      </div>

      {/* 服务状态 + 版本更新 */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ActivityIcon className="h-5 w-5 text-slate-400" /> 服务运行状态
          </h2>
          <div className="mt-4 divide-y divide-slate-100">
            {services ? services.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.key} className="flex items-center gap-3 py-3.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-medium text-slate-800">{s.label}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-sm">
                    <span className={`h-2 w-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className={s.ok ? 'text-emerald-600' : 'text-rose-600'}>{s.ok ? '正常' : '异常'}</span>
                  </span>
                  <span className="w-16 text-right font-mono text-sm text-slate-400">{s.latency >= 0 ? `${s.latency} ms` : '—'}</span>
                </div>
              )
            }) : <p className="py-6 text-sm text-slate-400">加载中…</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">版本更新</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">当前版本</dt>
              <dd className="font-mono font-semibold text-slate-800">{version ? `v${version.version}` : '—'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">最新版本</dt>
              <dd className="flex items-center gap-3">
                {version?.latest
                  ? <span className="font-mono font-semibold text-slate-800">v{version.latest.version}</span>
                  : <span className="font-mono text-slate-400">获取中</span>}
                {version && (version.update_available
                  ? <Badge tone="amber">可升级</Badge>
                  : <Badge tone="emerald">已是最新</Badge>)}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            {version?.update_available
              ? <ButtonLink href="/admin/upgrade" className="w-full justify-center">前往升级</ButtonLink>
              : <div className="flex h-11 w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">暂无可升级版本</div>}
          </div>
        </section>
      </div>

      {/* 配置中心 */}
      <h2 className="mb-4 mt-8 text-lg font-semibold text-slate-900">配置中心</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ConfigCard icon={UsersIcon} tone="primary" title="用户管理" href="/admin/users"
          status={userCount !== null ? `${userCount} 位用户 · ${fmtNum(bookCount)} 本书` : '查看与管理用户'} ok />
        <ConfigCard icon={ServerIcon} tone="sky" title="存储配置" href="/admin/settings/storage"
          status={storage ? (storage.driver === 'qiniu' ? '七牛云 · 已启用' : '本地磁盘 · 运行正常') : '加载中…'} ok />
        <ConfigCard icon={MailIcon} tone="amber" title="邮件服务" href="/admin/settings/mail"
          status={mail ? (mail.driver === 'smtp' ? 'SMTP · 已配置' : '日志驱动 · 待配置') : '加载中…'} ok={mail?.driver === 'smtp'} />
        <ConfigCard icon={GithubIcon} tone="emerald" title="GitHub OAuth" href="/admin/settings/oauth"
          status={oauth ? (oauth.client_id && oauth.client_secret ? '已启用' : '未配置') : '加载中…'} ok={!!(oauth?.client_id && oauth?.client_secret)} />
        <ConfigCard icon={TagIcon} tone="violet" title="标签分类" href="/explore"
          status={tagCount !== null ? `${tagCount} 个标签` : '前往发现页'} ok />
      </div>
    </AdminLayout>
  )
}

// fmtNum 数字本地化展示，null 显示为 —；大数加千分位
function fmtNum(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('zh-CN')
}

type Tone = 'emerald' | 'violet' | 'sky' | 'primary' | 'amber'
const iconTone: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  sky: 'bg-sky-50 text-sky-600',
  primary: 'bg-primary-50 text-primary-600',
  amber: 'bg-amber-50 text-amber-600',
}

function StatCard({ icon: Icon, tone, label, value, valueClass, dot }: {
  icon: (p: { className?: string }) => JSX.Element; tone: Tone; label: string
  value: string; valueClass?: string; dot?: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconTone[tone]}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className={`mt-0.5 flex items-center gap-2 text-lg font-bold ${valueClass || 'text-slate-900'}`}>
          <span className="truncate">{value}</span>
          {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
        </p>
      </div>
    </div>
  )
}

function ConfigCard({ icon: Icon, tone, title, status, href, ok }: {
  icon: (p: { className?: string }) => JSX.Element; tone: Tone; title: string
  status: string; href: string; ok?: boolean
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconTone[tone]}`}>
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {status}
      </p>
      <Link href={href} className="mt-4 inline-flex h-8 w-fit items-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">
        管理
      </Link>
    </div>
  )
}
