import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, formatDate } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Badge, Button, EmptyState, Loading, SegmentedTabs, Textarea, useFeedback } from '@/components/ui'
import {
  WRITER_ACTIONS, adoptInto, buildRequest, locateTarget, useWriterTaskStream,
  type WriterAction, type WriterStatus, type WriterTarget, type WriterTask,
} from '@/lib/ai-writer'
import type { PageResult } from '@/lib/types'

export type AIWriterTab = 'assist' | 'history'

// WriterEditorBridge 写作台编辑区的读写接口（插件不直接操作写作台状态）。
export interface WriterEditorBridge {
  read: () => { content: string; start: number; end: number }
  write: (content: string, selStart: number, selEnd: number) => void
}

interface Props {
  bookId: number
  docId: number | null
  tab: AIWriterTab
  // 由写作台写入 URL（?ai=assist|history）
  onNavigate: (tab: AIWriterTab | null) => void
  selectionLength: number
  editor: WriterEditorBridge
}

const statusTone: Record<WriterTask['status'], 'primary' | 'emerald' | 'rose' | 'slate'> = { running: 'primary', done: 'emerald', failed: 'rose', canceled: 'slate' }

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

// AIWriterDrawer 写作台右侧 AI 写作助手（桌面端与编辑区并排，写作台为其让出右侧空间，可一边选中文字一边使用）：「助手」对选中文字执行动作并流式显示结果，对比原文后替换或插入；「记录」查看本书的历史结果。
export default function AIWriterDrawer({ bookId, docId, tab, onNavigate, selectionLength, editor }: Props) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<WriterStatus | null>(null)
  const loadStatus = useCallback(() => {
    api<WriterStatus>('/ai-writer/status').then(setStatus).catch(() => setStatus({ available: false, quota: { limit: 0, used: 0 } }))
  }, [])
  useEffect(() => { loadStatus() }, [loadStatus])

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30 lg:hidden" onClick={() => onNavigate(null)} />
      <aside className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-md flex-col lg:w-96 2xl:w-[28rem] 2xl:max-w-none border-l border-slate-200 bg-white shadow-2xl" aria-label={t('aiWriter.drawer.title')}>
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
          <i className="fa-solid fa-wand-magic-sparkles text-primary-500" aria-hidden="true" />
          <span className="font-semibold text-slate-900">{t('aiWriter.drawer.title')}</span>
          <button type="button" onClick={() => onNavigate(null)} aria-label={t('aiWriter.drawer.close')}
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <SegmentedTabs fullWidth size="sm" value={tab} ariaLabel={t('aiWriter.drawer.title')} onChange={(v) => onNavigate(v as AIWriterTab)}
            items={[
              { value: 'assist', label: t('aiWriter.drawer.tabAssist'), icon: <i className="fa-solid fa-pen-nib" aria-hidden="true" /> },
              { value: 'history', label: t('aiWriter.drawer.tabHistory'), icon: <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" /> },
            ]} />
        </div>
        {!status ? <Loading className="py-10" /> : !status.available ? (
          <div className="m-4"><EmptyState>{t('aiWriter.drawer.unavailable')}</EmptyState></div>
        ) : (
          <>
            {/* 两个面板都保持挂载：切到「记录」时进行中的生成继续显示 */}
            <div className={tab === 'assist' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
              <AssistPanel bookId={bookId} docId={docId} status={status} selectionLength={selectionLength} editor={editor} onFinished={loadStatus} />
            </div>
            <div className={tab === 'history' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
              {tab === 'history' && <HistoryPanel bookId={bookId} editor={editor} />}
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
              <span className="tabular-nums">
                {status.quota.limit < 0 ? t('aiWriter.quota.unlimited', { used: status.quota.used }) : t('aiWriter.quota.used', { used: status.quota.used, limit: status.quota.limit })}
              </span>
              <Link href="/user/ai-usage" target="_blank" className="ml-auto font-medium text-primary-600 hover:text-primary-700">{t('aiWriter.quota.viewUsage')}</Link>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

interface LastRequest {
  action: WriterAction
  instruction: string
  text: string
  before: string
  after: string
  target: WriterTarget
}

function AssistPanel({ bookId, docId, status, selectionLength, editor, onFinished }: {
  bookId: number
  docId: number | null
  status: WriterStatus
  selectionLength: number
  editor: WriterEditorBridge
  onFinished: () => void
}) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [action, setAction] = useState<WriterAction>(() => {
    const { start, end } = editor.read()
    return end > start ? 'polish' : 'continue'
  })
  const [instruction, setInstruction] = useState('')
  const [task, setTask] = useState<WriterTask | null>(null)
  const [last, setLast] = useState<LastRequest | null>(null)
  const [busy, setBusy] = useState<'' | 'create' | 'cancel' | 'replace' | 'insert'>('')

  useWriterTaskStream(task, (next) => setTask((cur) => (cur ? next(cur) : cur)))
  const finished = !!task && task.status !== 'running'
  useEffect(() => { if (finished) onFinished() }, [finished, onFinished])

  const meta = WRITER_ACTIONS.find((a) => a.key === action)!
  const outOfQuota = status.quota.limit >= 0 && status.quota.used >= status.quota.limit
  const targetHint = action === 'continue' ? t('aiWriter.assist.targetCursor')
    : selectionLength > 0 ? t('aiWriter.assist.targetSelection', { n: selectionLength })
      : meta.wholeChapter ? t('aiWriter.assist.targetChapter') : t('aiWriter.assist.targetNone')

  async function submit(req: LastRequest) {
    setBusy('create')
    try {
      const created = await api<WriterTask>('/ai-writer/tasks', {
        method: 'POST',
        body: { book_id: bookId, doc_id: docId || 0, action: req.action, text: req.text, before: req.before, after: req.after, instruction: req.instruction },
      })
      setTask(created)
      setLast(req)
    } catch (e) {
      showToast({ title: t('aiWriter.assist.createFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy('')
    }
  }

  function generate() {
    const { content, start, end } = editor.read()
    const req = buildRequest(action, content, start, end)
    if (!req.text.trim()) {
      showToast({ message: t(action === 'continue' ? 'aiWriter.assist.needText' : 'aiWriter.assist.needSelection'), tone: 'error' })
      return
    }
    void submit({ action, instruction: instruction.trim(), ...req })
  }

  async function cancel() {
    if (!task) return
    setBusy('cancel')
    try {
      await api(`/ai-writer/tasks/${task.id}/cancel`, { method: 'POST' })
    } catch (e) {
      showToast({ title: t('aiWriter.assist.cancelFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy('')
    }
  }

  async function adopt(mode: 'replace' | 'insert') {
    if (!task || !last) return
    const { content } = editor.read()
    const range = locateTarget(content, last.target)
    if (!range) {
      showToast({ title: t('aiWriter.assist.targetChanged'), message: t('aiWriter.assist.targetChangedHint'), tone: 'error' })
      return
    }
    // 续写直接接在光标处；其余「插入」作为新段落放在处理对象之后
    const next = adoptInto(content, range, task.result, last.action === 'continue' ? 'replace' : mode)
    editor.write(next.content, next.start, next.end)
    setBusy(mode)
    try {
      setTask(await api<WriterTask>(`/ai-writer/tasks/${task.id}/adopt`, { method: 'POST', body: { mode } }))
    } catch { /* 采纳记录失败不影响正文 */ } finally {
      setBusy('')
    }
    showToast({ message: t('aiWriter.assist.adopted'), tone: 'success' })
  }

  async function copy() {
    if (!task) return
    try {
      await copyText(task.result)
      showToast({ message: t('aiWriter.assist.copied'), tone: 'success' })
    } catch {
      showToast({ message: t('aiWriter.assist.copyFailed'), tone: 'error' })
    }
  }

  const running = task?.status === 'running'
  const hasResult = !!task && !running && task.result.trim() !== ''
  const canReplace = !!last && last.target.original !== '' && last.action !== 'continue'
  // 改写类动作默认替换原文，大纲/摘要默认插入到下方
  const preferReplace = canReplace && !!WRITER_ACTIONS.find((a) => a.key === last?.action)?.replace

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div className="grid grid-cols-4 gap-1.5">
        {WRITER_ACTIONS.map((a) => (
          <button key={a.key} type="button" disabled={running} onClick={() => setAction(a.key)} aria-pressed={action === a.key}
            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs transition-colors disabled:opacity-60 ${action === a.key ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <i className={`fa-solid ${a.icon}`} aria-hidden="true" />
            {t(`aiWriter.action.${a.key}`)}
          </button>
        ))}
      </div>
      <div>
        <p className="text-xs text-slate-500">{t(`aiWriter.actionHint.${action}`)}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><i className="fa-solid fa-crosshairs" aria-hidden="true" />{targetHint}</p>
      </div>
      <Textarea rows={2} className="min-h-[60px] text-sm" value={instruction} maxLength={500} disabled={running}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={t(action === 'custom' ? 'aiWriter.assist.customPlaceholder' : 'aiWriter.assist.extraPlaceholder')} />
      {outOfQuota ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{t(status.quota.limit === 0 ? 'aiWriter.quota.notIncluded' : 'aiWriter.quota.exhausted')}</p>
      ) : running ? (
        <Button variant="outline" className="w-full" loading={busy === 'cancel'} onClick={() => void cancel()}>
          <i className="fa-solid fa-stop" aria-hidden="true" />{t('aiWriter.assist.stop')}
        </Button>
      ) : (
        <Button className="w-full" loading={busy === 'create'} disabled={action === 'custom' && !instruction.trim()} onClick={generate}>
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />{t('aiWriter.assist.generate')}
        </Button>
      )}

      {task && (
        <div className="space-y-3">
          {last && last.target.original && (
            <details className="rounded-lg border border-slate-200 bg-slate-50/60">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500">{t('aiWriter.assist.original', { n: last.target.original.length })}</summary>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-t border-slate-200 px-3 py-2 text-sm leading-6 text-slate-500">{last.target.original}</div>
            </details>
          )}
          <div className="rounded-lg border border-primary-100 bg-white">
            <div className="flex items-center gap-2 border-b border-primary-100 px-3 py-2 text-xs">
              <span className="font-medium text-primary-700">{t('aiWriter.assist.result')}</span>
              <Badge tone={statusTone[task.status]}>{t(`aiWriter.status.${task.status}`)}</Badge>
              {!running && task.output_tokens > 0 && (
                <span className="ml-auto tabular-nums text-slate-400">{t('aiWriter.assist.usage', { input: task.input_tokens, output: task.output_tokens, s: (task.duration_ms / 1000).toFixed(1) })}</span>
              )}
            </div>
            <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-7 text-slate-800">
              {task.result}
              {running && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary-400 align-middle" />}
              {running && !task.result && <span className="text-slate-400">{t('aiWriter.assist.generating')}</span>}
            </div>
            {task.error && task.status !== 'canceled' && <p className="border-t border-rose-100 px-3 py-2 text-xs text-rose-600">{task.error}</p>}
          </div>
          {hasResult && (
            <div className="flex flex-wrap gap-2">
              {last?.action === 'continue' ? (
                <Button size="sm" loading={busy === 'insert'} onClick={() => void adopt('insert')}>{t('aiWriter.assist.insertAtCursor')}</Button>
              ) : (
                <>
                  <Button size="sm" variant="primary" loading={busy === (preferReplace ? 'replace' : 'insert')} onClick={() => void adopt(preferReplace ? 'replace' : 'insert')}>
                    {t(preferReplace ? 'aiWriter.assist.replace' : 'aiWriter.assist.insertBelow')}
                  </Button>
                  {canReplace && (
                    <Button size="sm" variant="outline" loading={busy === (preferReplace ? 'insert' : 'replace')} onClick={() => void adopt(preferReplace ? 'insert' : 'replace')}>
                      {t(preferReplace ? 'aiWriter.assist.insertBelow' : 'aiWriter.assist.replace')}
                    </Button>
                  )}
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => void copy()}>{t('aiWriter.assist.copy')}</Button>
              <Button size="sm" variant="ghost" loading={busy === 'create'} disabled={!last || outOfQuota} onClick={() => last && void submit(last)}>{t('aiWriter.assist.regenerate')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setTask(null); setLast(null) }}>{t('aiWriter.assist.discard')}</Button>
            </div>
          )}
          {task.adopted && <p className="text-xs text-emerald-600"><i className="fa-solid fa-check mr-1" aria-hidden="true" />{t(`aiWriter.adopted.${task.adopted}`)}</p>}
        </div>
      )}
    </div>
  )
}

function HistoryPanel({ bookId, editor }: { bookId: number; editor: WriterEditorBridge }) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [items, setItems] = useState<WriterTask[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  const load = useCallback(async (p: number) => {
    const d = await api<PageResult<WriterTask>>(`/ai-writer/tasks?book_id=${bookId}&page=${p}&page_size=20`)
    setItems((cur) => (p === 1 ? d.items : [...(cur || []), ...d.items]))
    setTotal(d.total)
    setPage(p)
  }, [bookId])

  useEffect(() => {
    load(1).catch((e) => { setItems([]); showToast({ title: t('aiWriter.history.loadFailed'), message: (e as Error).message, tone: 'error' }) })
  }, [load, showToast, t])

  async function more() {
    setLoadingMore(true)
    try { await load(page + 1) } catch (e) {
      showToast({ title: t('aiWriter.history.loadFailed'), message: (e as Error).message, tone: 'error' })
    } finally { setLoadingMore(false) }
  }

  async function remove(item: WriterTask) {
    setDeleting(item.id)
    try {
      await api(`/ai-writer/tasks/${item.id}`, { method: 'DELETE' })
      setItems((cur) => (cur || []).filter((x) => x.id !== item.id))
      setTotal((n) => n - 1)
    } catch (e) {
      showToast({ title: t('aiWriter.history.deleteFailed'), message: (e as Error).message, tone: 'error' })
    } finally { setDeleting(null) }
  }

  function insert(item: WriterTask) {
    const { content, end } = editor.read()
    const next = adoptInto(content, { start: end, end }, item.result, 'insert')
    editor.write(next.content, next.start, next.end)
    showToast({ message: t('aiWriter.assist.adopted'), tone: 'success' })
  }

  async function copy(item: WriterTask) {
    try {
      await copyText(item.result)
      showToast({ message: t('aiWriter.assist.copied'), tone: 'success' })
    } catch {
      showToast({ message: t('aiWriter.assist.copyFailed'), tone: 'error' })
    }
  }

  if (!items) return <Loading className="py-10" />
  if (items.length === 0) return <div className="m-4"><EmptyState>{t('aiWriter.history.empty')}</EmptyState></div>
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-800">{t(`aiWriter.action.${item.action}`)}</span>
            <Badge tone={statusTone[item.status]}>{t(`aiWriter.status.${item.status}`)}</Badge>
            {item.adopted && <Badge tone="emerald">{t(`aiWriter.adopted.${item.adopted}`)}</Badge>}
            <span className="ml-auto text-slate-400">{formatDate(item.created_at)}</span>
          </div>
          {item.instruction && <p className="mt-1.5 text-xs text-slate-500">{t('aiWriter.history.instruction', { text: item.instruction })}</p>}
          <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap break-words text-xs text-slate-400">{item.input}</p>
          {item.result && <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.result}</p>}
          {item.error && item.status === 'failed' && <p className="mt-1.5 text-xs text-rose-600">{item.error}</p>}
          <div className="mt-2 flex gap-1.5">
            {item.result && item.status !== 'running' && (
              <>
                <Button size="sm" variant="outline" onClick={() => insert(item)}>{t('aiWriter.history.insert')}</Button>
                <Button size="sm" variant="ghost" onClick={() => void copy(item)}>{t('aiWriter.assist.copy')}</Button>
              </>
            )}
            {item.status !== 'running' && (
              <Button size="sm" variant="ghost" className="ml-auto text-rose-600" loading={deleting === item.id} onClick={() => void remove(item)}>{t('aiWriter.history.delete')}</Button>
            )}
          </div>
        </div>
      ))}
      {items.length < total && (
        <Button variant="outline" size="sm" className="w-full" loading={loadingMore} onClick={() => void more()}>{t('aiWriter.history.more')}</Button>
      )}
    </div>
  )
}
