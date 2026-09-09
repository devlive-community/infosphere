import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import { Badge, ButtonLink, Loading } from '@/components/ui'
import {
  ShieldCheckIcon, TagIcon, DatabaseIcon, CodeIcon, GlobeIcon, ServerIcon,
  ActivityIcon, ExternalLinkIcon, MailIcon, GithubIcon, UsersIcon,
  BookIcon, FileTextIcon, EyeIcon, ClockIcon, GearIcon,
} from '@/components/icons'
import {
  SystemVersion, HealthInfo, MailConfig, StorageConfig, OAuthConfig,
  AdminActivity, ActivityUser, ActivityBook,
  fetchHealth, measure,
} from '@/lib/admin'
import { formatDate } from '@/lib/api'

interface Service { key: string; label: string; icon: (p: { className?: string }) => JSX.Element; ok: boolean; latency: number }

const DB_LABEL: Record<string, string> = { sqlite: 'SQLite', mysql: 'MySQL', postgres: 'PostgreSQL' }
const BOOK_STATUS: Record<string, { label: string; tone: 'slate' | 'primary' | 'emerald' | 'violet' | 'amber' }> = {
  draft: { label: '草稿', tone: 'slate' },
  in_progress: { label: '进行中', tone: 'primary' },
  published: { label: '已发布', tone: 'emerald' },
  completed: { label: '已完成', tone: 'violet' },
  archived: { label: '已归档', tone: 'amber' },
}

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
  const [activity, setActivity] = useState<AdminActivity | null>(null)
  const [configCount, setConfigCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    const healthRequest = fetchHealth().then(async ({ health, latency }) => {
      setHealth(health)
      const [webMs, dbMs] = await Promise.all([measure('/', { method: 'HEAD' }), measure('/api/v1/stats')])
      setServices([
        { key: 'api', label: 'API 服务', icon: ServerIcon, ok: health.status === 'ok', latency },
        { key: 'web', label: 'Web SSR', icon: GlobeIcon, ok: health.web !== 'down', latency: webMs },
        { key: 'db', label: '数据库连接', icon: DatabaseIcon, ok: health.db === 'up', latency: dbMs },
      ])
    })
    const statsRequest = api<{ user_count: number; book_count: number; document_count: number; tag_count: number; total_views: number }>('/admin/stats')
      .then((s) => {
        setUserCount(s.user_count)
        setBookCount(s.book_count)
        setDocCount(s.document_count)
        setTagCount(s.tag_count)
        setTotalViews(s.total_views)
      })
    Promise.allSettled([
      healthRequest,
      api<SystemVersion>('/system/version').then(setVersion),
      api<{ db_type?: string }>('/setup/status').then((s) => setDbType(s.db_type || '')),
      api<StorageConfig>('/storage').then(setStorage),
      api<MailConfig>('/mail').then(setMail),
      api<OAuthConfig>('/oauth').then(setOauth),
      statsRequest,
      api<AdminActivity>('/admin/activity').then(setActivity),
      api<{ items?: unknown[] }>('/admin/configs').then((c) => setConfigCount(c?.items?.length ?? 0)),
    ]).finally(() => setLoading(false))
  }, [isAdmin])

  const dbName = DB_LABEL[dbType] || dbType || '—'
  const nodeVer = health?.node ? `Node.js ${health.node.replace(/^v/, '')}` : '—'
  const healthy = health?.status === 'ok'

  if (loading) {
    return (
      <AdminLayout current="system" breadcrumb="系统概览">
        <Loading className="min-h-[60vh]" label="正在加载控制台数据…" />
      </AdminLayout>
    )
  }

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
            }) : <p className="py-6 text-sm text-slate-400">暂时无法获取服务状态</p>}
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
              : <div className="flex w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400" style={{ height: 'var(--control-height)' }}>暂无可升级版本</div>}
          </div>
        </section>
      </div>

      {/* 最近活动时间线 */}
      <h2 className="mb-4 mt-8 text-lg font-semibold text-slate-900">最近活动</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityCard
          icon={<UsersIcon className="h-5 w-5" />} title="最近注册"
          empty="暂无注册用户"
          items={activity?.recent_users.map((u) => ({
            key: `u${u.id}`,
            primary: u.username,
            href: `/user/${u.username}`,
            meta: (
              <>
                <Badge tone={u.role === 'admin' ? 'primary' : 'slate'}>{u.role === 'admin' ? '管理员' : '用户'}</Badge>
                {!u.is_active && <Badge tone="rose">已停用</Badge>}
              </>
            ),
            time: u.created_at,
          })) ?? null}
        />
        <ActivityCard
          icon={<BookIcon className="h-5 w-5" />} title="最近建书"
          empty="暂无书籍"
          items={activity?.recent_books.map((b) => ({
            key: `b${b.id}`,
            primary: b.title,
            href: `/book/detail/${b.slug}`,
            meta: (
              <>
                <Badge tone={BOOK_STATUS[b.status]?.tone || 'slate'}>
                  {BOOK_STATUS[b.status]?.label || b.status}
                </Badge>
                {b.is_public ? <Badge tone="sky">公开</Badge> : <Badge tone="slate">私有</Badge>}
              </>
            ),
            time: b.created_at,
            extra: b.user?.username,
          })) ?? null}
        />
      </div>

      {/* 配置中心 */}
      <h2 className="mb-4 mt-8 text-lg font-semibold text-slate-900">配置中心</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ConfigCard icon={UsersIcon} tone="primary" title="用户管理" href="/admin/users"
          status={userCount !== null ? `${userCount} 位用户 · ${fmtNum(bookCount)} 本书` : '查看与管理用户'} ok />
        <ConfigCard icon={BookIcon} tone="violet" title="书籍管理" href="/admin/books"
          status={bookCount !== null ? `${fmtNum(bookCount)} 本书籍` : '查看与管理全站书籍'} ok />
        <ConfigCard icon={FileTextIcon} tone="sky" title="章节管理" href="/admin/documents"
          status={docCount !== null ? `${fmtNum(docCount)} 个章节` : '查看与管理全站章节'} ok />
        <ConfigCard icon={ServerIcon} tone="sky" title="存储配置" href="/admin/settings/storage"
          status={storage ? (storage.driver === 'qiniu' ? '七牛云 · 已启用' : '本地磁盘 · 运行正常') : '加载中…'} ok />
        <ConfigCard icon={MailIcon} tone="amber" title="邮件服务" href="/admin/settings/mail"
          status={mail ? (mail.driver === 'smtp' ? 'SMTP · 已配置' : '日志驱动 · 待配置') : '加载中…'} ok={mail?.driver === 'smtp'} />
        <ConfigCard icon={GithubIcon} tone="emerald" title="GitHub OAuth" href="/admin/settings/oauth"
          status={oauth ? (oauth.client_id && oauth.client_secret ? '已启用' : '未配置') : '加载中…'} ok={!!(oauth?.client_id && oauth?.client_secret)} />
        <ConfigCard icon={TagIcon} tone="violet" title="标签分类" href="/explore"
          status={tagCount !== null ? `${tagCount} 个标签` : '前往发现页'} ok />
        <ConfigCard icon={GearIcon} tone="primary" title="系统配置" href="/admin/settings/config"
          status={configCount !== null ? `${configCount} 个配置项` : '键值对配置管理'} ok />
        <ConfigCard icon={ClockIcon} tone="amber" title="异步任务" href="/admin/tasks"
          status="邮件重试与后台任务诊断" ok />
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
      <Link href={href} className="mt-4 inline-flex w-fit items-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
        style={{ height: 'var(--control-height-sm)' }}>
        管理
      </Link>
    </div>
  )
}

interface ActivityItem {
  key: string
  primary: string
  href: string
  meta: React.ReactNode
  time: string
  extra?: string
}

// ActivityCard 时间线卡片：最近用户/书籍列表，每行含主标题、状态徽标、相对时间与可选作者名
function ActivityCard({ icon, title, items, empty }: {
  icon: React.ReactNode; title: string; items: ActivityItem[] | null; empty: string
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
        <span className="text-slate-400">{icon}</span> {title}
      </h2>
      {items && items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.key}>
              <Link href={it.href}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-slate-800">{it.primary}</span>
                    {it.extra && <span className="shrink-0 text-xs text-slate-400">· {it.extra}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">{it.meta}</span>
                <span className="hidden w-28 shrink-0 text-right text-xs text-slate-400 sm:block">
                  <ClockIcon className="mr-1 inline h-3 w-3 align-text-bottom" />
                  {formatDate(it.time)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : items ? (
        <p className="py-6 text-sm text-slate-400">{empty}</p>
      ) : (
        <p className="py-6 text-sm text-slate-400">暂时无法获取活动数据</p>
      )}
    </section>
  )
}
