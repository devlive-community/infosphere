import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { InferGetServerSidePropsType } from 'next'
import { api } from '@/lib/api'
import { Badge, Button, ButtonLink, Loading, EmptyState, Tooltip, useFeedback } from '@/components/ui'
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, FolderIcon, GripIcon, PencilIcon, TrashIcon } from '@/components/icons'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import type { Document } from '@/lib/types'

export const getServerSideProps = getBookSettingsProps

const STATUS: Record<string, { label: string; tone: 'emerald' | 'slate' | 'amber' }> = {
  published: { label: '已发布', tone: 'emerald' },
  draft: { label: '草稿', tone: 'amber' },
  archived: { label: '已归档', tone: 'slate' },
}

type DropPos = 'before' | 'inside' | 'after'

function flatten(docs: Document[]): Document[] {
  return docs.flatMap((d) => [d, ...flatten(d.children || [])])
}

// 书籍设置 · 章节管理：查看全部章节，支持拖拽排序（含跨层级），快速跳转编辑或删除（仅可管理者）
export default function BookSettingsChapters({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast, confirmAction } = useFeedback()
  const [docs, setDocs] = useState<Document[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: DropPos } | null>(null)
  const [reordering, setReordering] = useState(false)

  const load = useCallback(() => {
    api<Document[]>(`/books/${book.id}/documents`).then((d) => setDocs(d || [])).catch((e) => showToast({ title: '加载失败', message: (e as Error).message, tone: 'error' }))
  }, [book.id, showToast])
  useEffect(() => { load() }, [load])

  const flat = useMemo(() => (docs ? flatten(docs) : []), [docs])

  // 拖拽起点自身子树内的节点不可作为放置目标（避免把父级拖进自己的孩子）
  const blocked = useMemo(() => {
    if (dragId == null) return null
    const set = new Set<number>()
    const walk = (d: Document) => { set.add(d.id); (d.children || []).forEach(walk) }
    const root = flat.find((d) => d.id === dragId)
    if (root) walk(root)
    return set
  }, [dragId, flat])

  async function remove(doc: Document) {
    if (!(await confirmAction({ title: '移入回收站', message: `确定将章节「${doc.title}」及其子章节移入回收站吗？可在 30 天内恢复。`, confirmLabel: '移入回收站', danger: true }))) return
    setBusy(doc.id)
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      showToast({ title: '删除失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // 拖拽移动：pos=before/after 挂到目标同级，inside 作为目标的子章节；批量写入受影响同级的 sort_order
  async function moveNode(dragDocId: number, targetId: number, pos: DropPos) {
    if (!docs || dragDocId === targetId) return
    const drag = flat.find((d) => d.id === dragDocId)
    const target = flat.find((d) => d.id === targetId)
    if (!drag || !target) return
    if (blocked?.has(targetId)) return

    let newParent: number | null
    let siblings: Document[]
    if (pos === 'inside') {
      newParent = target.id
      siblings = (target.children || []).slice()
    } else {
      newParent = target.parent_id ?? null
      siblings = (newParent === null ? docs : flat.find((d) => d.id === newParent)?.children || []).slice()
    }
    const without = siblings.filter((d) => d.id !== dragDocId)
    let insertAt = without.length
    if (pos !== 'inside') {
      const idx = without.findIndex((d) => d.id === targetId)
      if (idx < 0) return
      insertAt = pos === 'before' ? idx : idx + 1
    }
    without.splice(insertAt, 0, drag)

    const parentChanged = (drag.parent_id ?? null) !== newParent
    const writes: Promise<unknown>[] = []
    without.forEach((d, i) => {
      if (d.id === dragDocId) {
        if (parentChanged || d.sort_order !== i) writes.push(api(`/documents/${d.id}`, { method: 'PUT', body: { parent_id: newParent, sort_order: i } }))
      } else if (d.sort_order !== i) {
        writes.push(api(`/documents/${d.id}`, { method: 'PUT', body: { sort_order: i } }))
      }
    })
    if (!writes.length) return
    setReordering(true)
    try {
      await Promise.all(writes)
      if (pos === 'inside') setExpanded((s) => new Set(s).add(target.id))
      load()
    } catch (e) {
      showToast({ title: '排序失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setReordering(false)
    }
  }

  function endDrag() { setDragId(null); setDropTarget(null) }

  function renderNode(doc: Document, level: number) {
    const meta = STATUS[doc.status] || STATUS.draft
    const hasChildren = !!doc.children?.length
    const isExpanded = expanded.has(doc.id)
    const dragging = dragId === doc.id
    const dropHere = dropTarget?.id === doc.id
    return (
      <li key={doc.id}>
        <div
          draggable={!reordering}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(doc.id) }}
          onDragEnd={endDrag}
          onDragOver={(e) => {
            if (dragId == null || dragId === doc.id || blocked?.has(doc.id)) return
            e.preventDefault()
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const pos: DropPos = y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside'
            setDropTarget({ id: doc.id, pos })
          }}
          onDrop={(e) => { e.preventDefault(); if (dragId != null && dropTarget) moveNode(dragId, doc.id, dropTarget.pos); endDrag() }}
          className={`group relative flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-slate-50/60 ${dragging ? 'opacity-40' : ''}`}
          style={{ marginLeft: level * 20 }}>
          {dropHere && dropTarget!.pos !== 'inside' && <span className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-primary-500 ${dropTarget!.pos === 'before' ? 'top-0' : 'bottom-0'}`} />}
          {dropHere && dropTarget!.pos === 'inside' && <span className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-2 ring-inset ring-primary-400" />}
          <Tooltip content="拖拽调整顺序">
            <span className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-slate-300 group-hover:text-slate-500"><GripIcon className="h-4 w-4" /></span>
          </Tooltip>
          {hasChildren ? (
            <button type="button" aria-label={isExpanded ? '折叠' : '展开'}
              onClick={() => setExpanded((s) => { const n = new Set(s); n.has(doc.id) ? n.delete(doc.id) : n.add(doc.id); return n })}
              className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600">
              {isExpanded ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {hasChildren
            ? <FolderIcon className="h-4 w-4 shrink-0 text-slate-400" />
            : <FileTextIcon className="h-4 w-4 shrink-0 text-slate-300" />}
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{book.chapter_prefix}{doc.title}</span>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Link href={`/book/writer/${encodeURIComponent(book.slug)}/${encodeURIComponent(doc.slug)}`}
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs text-slate-600 transition-colors hover:border-primary-400 hover:text-primary-600"
            style={{ height: 'var(--control-height-sm)' }}>
            <PencilIcon className="h-3.5 w-3.5" /> 编辑
          </Link>
          <Button size="sm" variant="danger" disabled={busy === doc.id} onClick={() => remove(doc)}>
            <TrashIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
        {hasChildren && isExpanded && (
          <ul>{doc.children!.map((child) => renderNode(child, level + 1))}</ul>
        )}
      </li>
    )
  }

  return (
    <BookSettingsLayout book={book} active="chapters">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">章节管理</h2>
            <p className="mt-1 text-sm text-slate-500">拖拽章节可调整顺序或层级（拖到中部成为子章节）；内容编辑请进入写作台。</p>
          </div>
          <ButtonLink href={`/book/writer/${encodeURIComponent(book.slug)}`}>进入写作台</ButtonLink>
        </div>

        {docs === null ? (
          <Loading className="py-16" label="正在加载章节…" />
        ) : docs.length === 0 ? (
          <div className="p-6"><EmptyState>还没有章节，<Link href={`/book/writer/${encodeURIComponent(book.slug)}`} className="text-primary-600 hover:underline">去写作台创建</Link></EmptyState></div>
        ) : (
          <ul className="p-3">{docs.map((doc) => renderNode(doc, 0))}</ul>
        )}
      </div>
    </BookSettingsLayout>
  )
}
