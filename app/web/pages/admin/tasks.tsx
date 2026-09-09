import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { ClockIcon } from '@/components/icons'
import { Badge, Button, EmptyState, Input, Loading, Pagination, Select, useFeedback } from '@/components/ui'
import { api, formatDate } from '@/lib/api'
import { useApp } from '@/lib/auth'
import type { PageResult } from '@/lib/types'

const PAGE_SIZE = 20

type TaskStatus = 'pending' | 'running' | 'retrying' | 'succeeded' | 'failed'

interface BackgroundTask {
  id: number
  type: string
  status: TaskStatus
  attempts: number
  max_attempts: number
  available_at: string
  started_at: string | null
  finished_at: string | null
  last_error: string
  created_at: string
  updated_at: string
}

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '等待执行' },
  { value: 'running', label: '执行中' },
  { value: 'retrying', label: '等待重试' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '最终失败' },
]

const statusMeta: Record<TaskStatus, { label: string; tone: 'slate' | 'primary' | 'amber' | 'emerald' | 'rose' }> = {
  pending: { label: '等待执行', tone: 'slate' },
  running: { label: '执行中', tone: 'primary' },
  retrying: { label: '等待重试', tone: 'amber' },
  succeeded: { label: '已完成', tone: 'emerald' },
  failed: { label: '最终失败', tone: 'rose' },
}

const typeLabels: Record<string, string> = {
  'email.send': '发送邮件',
  'content.import.pdf': '解析 PDF 并导入书籍',
  'content.import.zip': '还原 ZIP 书籍',
}

export default function AdminTasks() {
  const { user } = useApp()
  const { showToast } = useFeedback()
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState<BackgroundTask[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [typeInput, setTypeInput] = useState('')
  const [jobType, setJobType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryingID, setRetryingID] = useState<number | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const result = await api<PageResult<BackgroundTask>>('/admin/tasks', {
        params: { page, page_size: PAGE_SIZE, status, type: jobType },
      })
      setItems(result.items || [])
      setTotal(result.total)
    } catch (requestError) {
      setError((requestError as Error).message)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [jobType, page, status])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  useEffect(() => {
    if (!items.some((item) => ['pending', 'running', 'retrying'].includes(item.status))) return
    const timer = window.setInterval(() => void load(true), 3000)
    return () => window.clearInterval(timer)
  }, [items, load])

  async function retry(task: BackgroundTask) {
    setRetryingID(task.id)
    try {
      await api(`/admin/tasks/${task.id}/retry`, { method: 'POST' })
      showToast('任务已重新排队')
      await load(true)
    } catch (requestError) {
      showToast({ title: '重新排队失败', message: (requestError as Error).message, tone: 'error' })
    } finally {
      setRetryingID(null)
    }
  }

  function applyType(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setJobType(typeInput.trim())
  }

  return (
    <AdminLayout current="tasks" breadcrumb="异步任务">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ClockIcon className="h-6 w-6 text-primary-600" />异步任务
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">查看邮件发送等后台任务的执行、自动重试和失败诊断。</p>
        </div>
        <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">共 {total} 个任务</span>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={applyType} className="w-full sm:w-56">
            <Input value={typeInput} onChange={(event) => setTypeInput(event.target.value)} placeholder="任务类型，如 email.send" />
          </form>
          <Select className="w-40" value={status} options={statusOptions}
            onChange={(value) => { setStatus(value); setPage(1) }} />
          {(jobType || status) && <Button variant="ghost" onClick={() => { setTypeInput(''); setJobType(''); setStatus(''); setPage(1) }}>清除筛选</Button>}
        </div>
      </div>

      {error && <div className="mb-4 max-h-32 overflow-auto break-words rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <Loading className="py-24" label="正在加载异步任务…" />
      ) : items.length === 0 ? (
        <EmptyState>暂无符合条件的异步任务</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-medium text-slate-400">
                    <th className="px-5 py-3">任务</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">尝试次数</th>
                    <th className="px-5 py-3">创建时间</th>
                    <th className="px-5 py-3">最近结果</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((task) => {
                    const meta = statusMeta[task.status] || statusMeta.pending
                    return (
                      <tr key={task.id} className="align-top hover:bg-slate-50/60">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-800">{typeLabels[task.type] || task.type}</p>
                          <p className="mt-0.5 text-xs text-slate-400">#{task.id} · {task.type}</p>
                        </td>
                        <td className="px-5 py-4"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-5 py-4 text-slate-600">{task.attempts} / {task.max_attempts}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(task.created_at)}</td>
                        <td className="max-w-md px-5 py-4">
                          {task.last_error ? (
                            <p className="max-h-24 overflow-auto break-words rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{task.last_error}</p>
                          ) : (
                            <span className="text-slate-400">{task.finished_at ? formatDate(task.finished_at) : '等待执行'}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {task.status === 'failed' && <Button size="sm" variant="outline" loading={retryingID === task.id} onClick={() => retry(task)}>重新排队</Button>}
                        </td>
                      </tr>
                    )
                  })}
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
