import { FormEvent, useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { ActivityIcon, SearchIcon, ShieldCheckIcon } from '@/components/icons'
import { Badge, Button, EmptyState, Input, Loading, Pagination, Select } from '@/components/ui'
import { api, formatDate } from '@/lib/api'
import { useApp } from '@/lib/auth'
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

const actionOptions = [
  { value: '', label: '全部操作' },
  { value: 'user.role_updated', label: '变更用户角色' },
  { value: 'user.status_updated', label: '启用或停用用户' },
  { value: 'user.deleted', label: '删除用户' },
  { value: 'book.moderated', label: '调整书籍发布状态' },
  { value: 'book.permanently_deleted', label: '永久删除书籍' },
  { value: 'document.permanently_deleted', label: '永久删除章节' },
  { value: 'report.resolved', label: '处理内容举报' },
  { value: 'site.updated', label: '修改站点设置' },
  { value: 'config.updated', label: '修改系统配置' },
  { value: 'config.deleted', label: '删除系统配置' },
  { value: 'mail.updated', label: '修改邮件配置' },
  { value: 'oauth.updated', label: '修改 OAuth 配置' },
  { value: 'storage.updated', label: '修改存储配置' },
  { value: 'system.upgraded', label: '升级系统' },
]

const resourceOptions = [
  { value: '', label: '全部资源' },
  { value: 'user', label: '用户' },
  { value: 'book', label: '书籍' },
  { value: 'document', label: '章节' },
  { value: 'report', label: '内容举报' },
  { value: 'config', label: '配置' },
  { value: 'site', label: '站点' },
  { value: 'system', label: '系统' },
]

const actionLabels = Object.fromEntries(actionOptions.map((item) => [item.value, item.label]))
const resourceLabels = Object.fromEntries(resourceOptions.map((item) => [item.value, item.label]))

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value === null || value === undefined || value === '') return '未设置'
  return String(value)
}

function summaryText(summary: Record<string, unknown>): string {
  const fields = summary.changed_fields
  if (Array.isArray(fields)) return `变更字段：${fields.map(displayValue).join('、')}`
  const parts = Object.entries(summary).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const change = value as { from?: unknown; to?: unknown }
      if ('from' in change || 'to' in change) return `${key}：${displayValue(change.from)} → ${displayValue(change.to)}`
    }
    return `${key}：${displayValue(value)}`
  })
  return parts.join('；') || '已完成操作'
}

export default function AdminAuditLogs() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
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
    <AdminLayout current="audit" breadcrumb="审计日志">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ActivityIcon className="h-6 w-6 text-primary-600" />审计日志
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">追踪管理员对账号、内容、配置和系统执行的高风险操作。</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          <ShieldCheckIcon className="h-4 w-4" />敏感字段仅记录变更摘要
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={applyOperator} className="w-full sm:w-56">
            <Input value={operatorInput} onChange={(event) => setOperatorInput(event.target.value)}
              leading={<SearchIcon className="h-4 w-4" />} placeholder="搜索操作人" />
          </form>
          <Select className="w-48" value={action} options={actionOptions}
            onChange={(value) => { setAction(value); setPage(1) }} />
          <Select className="w-36" value={resourceType} options={resourceOptions}
            onChange={(value) => { setResourceType(value); setPage(1) }} />
          <Input className="w-36" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1) }} placeholder="开始 YYYY-MM-DD" />
          <Input className="w-36" value={to} onChange={(event) => { setTo(event.target.value); setPage(1) }} placeholder="结束 YYYY-MM-DD" />
          {hasFilters && <Button variant="ghost" onClick={clearFilters}>清除筛选</Button>}
          <span className="ml-auto text-sm text-slate-400">共 {total} 条记录</span>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <Loading className="py-24" label="正在加载审计日志…" />
      ) : items.length === 0 ? (
        <EmptyState>没有符合条件的审计记录</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-medium text-slate-400">
                    <th className="px-5 py-3">时间</th>
                    <th className="px-5 py-3">操作人</th>
                    <th className="px-5 py-3">操作</th>
                    <th className="px-5 py-3">资源</th>
                    <th className="px-5 py-3">变更摘要</th>
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
                      <td className="max-w-lg px-5 py-4 leading-6 text-slate-600">{summaryText(item.summary)}</td>
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
