import { FormEvent, useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { ActivityIcon, SearchIcon, ShieldCheckIcon } from '@/components/icons'
import { Badge, Button, DatePicker, EmptyState, Input, Loading, Pagination, Select } from '@/components/ui'
import { api, formatDate } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import type { PageResult } from '@/lib/types'

const PAGE_SIZE = 20

interface AuditLog {
  id: number
  actor_id: number
  actor_username: string
  action: string
  resource_type: string
  resource_id: string
  resource_label: string
  summary: Record<string, unknown>
  created_at: string
}

const actionLabels = Object.fromEntries(actionOptions.map((item) => [item.value, item.label]))
const resourceLabels = Object.fromEntries(resourceOptions.map((item) => [item.value, item.label]))

function displayValue(value: unknown, t: (key: string) => string): string {
  if (typeof value === 'boolean') return value ? t('common.boolean.yes') : t('common.boolean.no')
  if (value === null || value === undefined || value === '') return t('common.unset')
  return String(value)
}

function summaryText(summary: Record<string, unknown>, t: (key: string) => string): string {
  const fields = summary.changed_fields
  if (Array.isArray(fields)) return `${t('admin.audit.changedFields')}${fields.map((f) => displayValue(f, t)).join('、')}`
  const parts = Object.entries(summary).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const change = value as { from?: unknown; to?: unknown }
      if ('from' in change || 'to' in change) return `${key}：${displayValue(change.from, t)} → ${displayValue(change.to, t)}`
    }
    return `${key}：${displayValue(value, t)}`
  })
  return parts.join('；') || t('admin.audit.completed')
}

export default function AdminAuditLogs() {
  const { user } = useApp()
  const { t } = useTranslation()
  const isAdmin = user?.role === 'admin'

  const actionOptions = [
    { value: '', label: t('admin.audit.action.all') },
    { value: 'user.role_updated', label: t('admin.audit.action.userRoleUpdated') },
    { value: 'user.status_updated', label: t('admin.audit.action.userStatusUpdated') },
    { value: 'user.deleted', label: t('admin.audit.action.userDeleted') },
    { value: 'book.moderated', label: t('admin.audit.action.bookModerated') },
    { value: 'book.permanently_deleted', label: t('admin.audit.action.bookPermanentlyDeleted') },
    { value: 'document.permanently_deleted', label: t('admin.audit.action.documentPermanentlyDeleted') },
    { value: 'report.resolved', label: t('admin.audit.action.reportResolved') },
    { value: 'site.updated', label: t('admin.audit.action.siteUpdated') },
    { value: 'config.updated', label: t('admin.audit.action.configUpdated') },
    { value: 'config.deleted', label: t('admin.audit.action.configDeleted') },
    { value: 'mail.updated', label: t('admin.audit.action.mailUpdated') },
    { value: 'oauth.updated', label: t('admin.audit.action.oauthUpdated') },
    { value: 'storage.updated', label: t('admin.audit.action.storageUpdated') },
    { value: 'system.upgraded', label: t('admin.audit.action.systemUpgraded') },
    { value: 'task.retried', label: t('admin.audit.action.taskRetried') },
    { value: 'achievement.settings_updated', label: t('admin.audit.action.achievementSettingsUpdated') },
    { value: 'achievement.created', label: t('admin.audit.action.achievementCreated') },
    { value: 'achievement.updated', label: t('admin.audit.action.achievementUpdated') },
    { value: 'achievement.archived', label: t('admin.audit.action.achievementArchived') },
    { value: 'achievement.recalculated', label: t('admin.audit.action.achievementRecalculated') },
    { value: 'achievement.icon_uploaded', label: t('admin.audit.action.achievementIconUploaded') },
    { value: 'achievement.granted', label: t('admin.audit.action.achievementGranted') },
    { value: 'achievement.revoked', label: t('admin.audit.action.achievementRevoked') },
  ]

  const resourceOptions = [
    { value: '', label: t('admin.audit.resource.all') },
    { value: 'user', label: t('admin.audit.resource.user') },
    { value: 'book', label: t('admin.audit.resource.book') },
    { value: 'document', label: t('admin.audit.resource.document') },
    { value: 'report', label: t('admin.audit.resource.report') },
    { value: 'config', label: t('admin.audit.resource.config') },
    { value: 'site', label: t('admin.audit.resource.site') },
    { value: 'system', label: t('admin.audit.resource.system') },
    { value: 'task', label: t('admin.audit.resource.task') },
    { value: 'achievement', label: t('admin.audit.resource.achievement') },
    { value: 'achievement_asset', label: t('admin.audit.resource.achievementAsset') },
    { value: 'achievement_grant', label: t('admin.audit.resource.achievementGrant') },
  ]
  const [items, setItems] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [operatorInput, setOperatorInput] = useState('')
  const [operator, setOperator] = useState('')
  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api<PageResult<AuditLog>>('/admin/audit-logs', {
        params: { page, page_size: PAGE_SIZE, actor: operator, action, resource_type: resourceType, from, to },
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (requestError) {
      setError((requestError as Error).message)
    } finally {
      setLoading(false)
    }
  }, [action, from, operator, page, resourceType, to])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  function applyOperator(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setOperator(operatorInput.trim())
  }

  function clearFilters() {
    setOperatorInput('')
    setOperator('')
    setAction('')
    setResourceType('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const hasFilters = Boolean(operator || action || resourceType || from || to)

  return (
    <AdminLayout current="audit" breadcrumb={t('admin.nav.audit')}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ActivityIcon className="h-6 w-6 text-primary-600" />{t('admin.nav.audit')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">{t('admin.audit.description')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          <ShieldCheckIcon className="h-4 w-4" />{t('admin.audit.sensitiveNote')}
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={applyOperator} className="w-full sm:w-56">
            <Input value={operatorInput} onChange={(event) => setOperatorInput(event.target.value)}
              leading={<SearchIcon className="h-4 w-4" />} placeholder={t('admin.audit.searchPlaceholder')} />
          </form>
          <Select className="w-48" value={action} options={actionOptions}
            onChange={(value) => { setAction(value); setPage(1) }} />
          <Select className="w-36" value={resourceType} options={resourceOptions}
            onChange={(value) => { setResourceType(value); setPage(1) }} />
          <DatePicker className="w-40" value={from} onChange={(value) => { setFrom(value); setPage(1) }} placeholder={t('common.date.from')} max={to || undefined} ariaLabel={t('common.date.from')} />
          <DatePicker className="w-40" value={to} onChange={(value) => { setTo(value); setPage(1) }} placeholder={t('common.date.to')} min={from || undefined} ariaLabel={t('common.date.to')} />
          {hasFilters && <Button variant="ghost" onClick={clearFilters}>{t('common.actions.clearFilter')}</Button>}
          <span className="ml-auto text-sm text-slate-400">{t('admin.audit.totalRecords', { total })}</span>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <Loading className="py-24" label={t('admin.audit.loading')} />
      ) : items.length === 0 ? (
        <EmptyState>{t('admin.audit.empty')}</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-medium text-slate-400">
                    <th className="px-5 py-3">{t('admin.audit.column.time')}</th>
                    <th className="px-5 py-3">{t('admin.audit.column.actor')}</th>
                    <th className="px-5 py-3">{t('admin.audit.column.action')}</th>
                    <th className="px-5 py-3">{t('admin.audit.column.resource')}</th>
                    <th className="px-5 py-3">{t('admin.audit.column.summary')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(item.created_at)}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-800">{item.actor_username}</p>
                        <p className="mt-0.5 text-xs text-slate-400">ID {item.actor_id}</p>
                      </td>
                      <td className="px-5 py-4"><Badge tone="slate">{actionLabels[item.action] || item.action}</Badge></td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-700">{item.resource_label || `${resourceLabels[item.resource_type] || item.resource_type} ${item.resource_id}`}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{resourceLabels[item.resource_type] || item.resource_type} · {item.resource_id}</p>
                      </td>
                      <td className="max-w-lg px-5 py-4 leading-6 text-slate-600">{summaryText(item.summary, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </AdminLayout>
  )
}
