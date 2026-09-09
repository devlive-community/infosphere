import { RefObject, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { Book, Document, User } from '@/lib/types'
import { api, formatDate } from '@/lib/api'
import { relocateAnnotation, type ReadingAnnotation } from '@/lib/reading-annotations'
import { Badge, Button, ButtonLink, Card, EmptyState, Loading, Modal, Textarea, Tooltip, useFeedback } from '@/components/ui'

export type { ReadingAnnotation } from '@/lib/reading-annotations'

interface SelectionAnchor {
  top: number
  left: number
  quote: string
  prefix: string
  suffix: string
  startOffset: number
  endOffset: number
}

const markClass: Record<ReadingAnnotation['color'], string> = {
  yellow: 'bg-amber-200/70', green: 'bg-emerald-200/70', blue: 'bg-sky-200/70',
  pink: 'bg-rose-200/70', purple: 'bg-violet-200/70',
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }
  return nodes
}

function rootText(root: HTMLElement): string {
  return textNodes(root).map((node) => node.data).join('')
}

function offsetFor(root: HTMLElement, targetNode: Node, targetOffset: number): number | null {
  let offset = 0
  for (const node of textNodes(root)) {
    if (node === targetNode) return offset + targetOffset
    offset += node.data.length
  }
  return null
}

function unwrapMarks(root: HTMLElement) {
  root.querySelectorAll('mark[data-reader-annotation]').forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ''))
  })
  root.normalize()
}

function wrapRange(root: HTMLElement, start: number, end: number, annotation: ReadingAnnotation) {
  let cursor = 0
  const targets = textNodes(root).map((node) => {
    const value = { node, start: cursor, end: cursor + node.data.length }
    cursor = value.end
    return value
  }).filter((entry) => entry.end > start && entry.start < end).reverse()
  for (const entry of targets) {
    const from = Math.max(0, start - entry.start)
    const to = Math.min(entry.node.data.length, end - entry.start)
    if (to <= from) continue
    const range = document.createRange()
    range.setStart(entry.node, from)
    range.setEnd(entry.node, to)
    const mark = document.createElement('mark')
    mark.dataset.readerAnnotation = String(annotation.id)
    mark.className = `cursor-pointer rounded-sm px-0.5 ${markClass[annotation.color] || markClass.yellow}`
    mark.setAttribute('aria-label', annotation.note ? `私人笔记：${annotation.note}` : '私人划线')
    range.surroundContents(mark)
  }
}

export default function ReaderAnnotations({ user, book, doc, contentRef }: {
  user: User | null
  book: Book
  doc: Document
  contentRef: RefObject<HTMLDivElement>
}) {
  const { showToast, confirmAction } = useFeedback()
  const [items, setItems] = useState<ReadingAnnotation[]>([])
  const [loading, setLoading] = useState(Boolean(user))
  const [selection, setSelection] = useState<SelectionAnchor | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<{ annotation: ReadingAnnotation | null; selection: SelectionAnchor | null } | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setItems(await api<ReadingAnnotation[]>(`/documents/${doc.id}/annotations`))
    } catch (error) {
      showToast({ title: '私人标注加载失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }, [doc.id, showToast, user])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    unwrapMarks(root)
    const text = rootText(root)
    const next = items.map((item) => item.kind === 'bookmark' ? item : { ...item, ...relocateAnnotation(item, text) })
    next.filter((item) => item.kind !== 'bookmark' && item.anchor_status !== 'orphaned')
      .sort((a, b) => b.start_offset - a.start_offset)
      .forEach((item) => wrapRange(root, item.start_offset, item.end_offset, item))
    const changed = next.filter((item, index) => item.start_offset !== items[index].start_offset || item.end_offset !== items[index].end_offset || item.anchor_status !== items[index].anchor_status)
    if (changed.length) {
      setItems(next)
      changed.forEach((item) => {
        void api(`/annotations/${item.id}`, { method: 'PUT', body: {
          start_offset: item.start_offset, end_offset: item.end_offset, anchor_status: item.anchor_status,
        } }).catch(() => undefined)
      })
    }
  }, [contentRef, items])

  useEffect(() => {
    const root = contentRef.current
    if (!root || !user) return
    const annotationRoot = root
    function handleMouseUp(event: MouseEvent) {
      const target = event.target as Node
      if (!annotationRoot.contains(target)) return
      const selected = window.getSelection()
      if (!selected || selected.isCollapsed || !selected.rangeCount) {
        setSelection(null)
        return
      }
      const range = selected.getRangeAt(0)
      if (!annotationRoot.contains(range.commonAncestorContainer)) return
      const start = offsetFor(annotationRoot, range.startContainer, range.startOffset)
      const end = offsetFor(annotationRoot, range.endContainer, range.endOffset)
      const quote = selected.toString().trim()
      if (start === null || end === null || !quote || end <= start) return
      const text = rootText(annotationRoot)
      const rect = range.getBoundingClientRect()
      setSelection({
        top: Math.max(12, rect.top - 48), left: Math.min(window.innerWidth - 170, Math.max(12, rect.left + rect.width / 2 - 80)),
        quote, prefix: text.slice(Math.max(0, start - 80), start), suffix: text.slice(end, end + 80),
        startOffset: start, endOffset: end,
      })
    }
    annotationRoot.addEventListener('mouseup', handleMouseUp)
    return () => annotationRoot.removeEventListener('mouseup', handleMouseUp)
  }, [contentRef, user])

  const bookmarked = useMemo(() => items.find((item) => item.kind === 'bookmark'), [items])

  async function createFromSelection(kind: 'highlight' | 'note', anchor: SelectionAnchor, noteValue = '') {
    setSaving(true)
    try {
      const created = await api<ReadingAnnotation>(`/documents/${doc.id}/annotations`, { method: 'POST', body: {
        kind, color: 'yellow', note: noteValue, quote: anchor.quote, prefix: anchor.prefix, suffix: anchor.suffix,
        start_offset: anchor.startOffset, end_offset: anchor.endOffset,
      } })
      setItems((current) => [...current, created])
      setSelection(null)
      window.getSelection()?.removeAllRanges()
      showToast({ message: kind === 'note' ? '私人笔记已保存' : '划线已保存', tone: 'success' })
    } catch (error) {
      showToast({ title: '保存失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleBookmark() {
    setSaving(true)
    try {
      if (bookmarked) {
        await api(`/annotations/${bookmarked.id}`, { method: 'DELETE' })
        setItems((current) => current.filter((item) => item.id !== bookmarked.id))
        showToast({ message: '章节书签已取消', tone: 'success' })
      } else {
        const created = await api<ReadingAnnotation>(`/documents/${doc.id}/annotations`, { method: 'POST', body: { kind: 'bookmark' } })
        setItems((current) => [...current.filter((item) => item.kind !== 'bookmark'), created])
        showToast({ message: '章节已加入书签', tone: 'success' })
      }
    } catch (error) {
      showToast({ title: '书签操作失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function saveNote() {
    if (!editing || !note.trim()) return
    setSaving(true)
    try {
      if (editing.annotation) {
        const updated = await api<ReadingAnnotation>(`/annotations/${editing.annotation.id}`, { method: 'PUT', body: { note } })
        setItems((current) => current.map((item) => item.id === updated.id ? updated : item))
      } else if (editing.selection) {
        await createFromSelection('note', editing.selection, note.trim())
      }
      setEditing(null)
      setNote('')
      showToast({ message: '私人笔记已保存', tone: 'success' })
    } catch (error) {
      showToast({ title: '笔记保存失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: ReadingAnnotation) {
    const confirmed = await confirmAction({ title: '删除私人标注', message: '删除后无法恢复，是否继续？', confirmLabel: '删除', danger: true })
    if (!confirmed) return
    try {
      await api(`/annotations/${item.id}`, { method: 'DELETE' })
      setItems((current) => current.filter((entry) => entry.id !== item.id))
      showToast({ message: '私人标注已删除', tone: 'success' })
    } catch (error) {
      showToast({ title: '删除失败', message: (error as Error).message, tone: 'error' })
    }
  }

  if (!user) {
    return <div className="mb-5 flex items-center gap-2 text-sm text-slate-400"><i className="fa-solid fa-highlighter" aria-hidden="true" />登录后可跨设备保存划线和私人笔记<ButtonLink href={`/login?next=${encodeURIComponent(`/book/reader/${book.slug}/${doc.slug}`)}`} variant="ghost" size="sm">登录</ButtonLink></div>
  }

  const selectionToolbar = selection && typeof document !== 'undefined' && createPortal(
    <Card className="fixed z-[170] flex items-center gap-1 p-1 shadow-xl" style={{ top: selection.top, left: selection.left }}>
      <Button size="sm" variant="ghost" disabled={saving} onClick={() => void createFromSelection('highlight', selection)}><i className="fa-solid fa-highlighter" aria-hidden="true" />划线</Button>
      <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setNote(''); setEditing({ annotation: null, selection }) }}><i className="fa-solid fa-note-sticky" aria-hidden="true" />笔记</Button>
    </Card>, document.body,
  )

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
        <Button size="sm" variant={bookmarked ? 'primary' : 'ghost'} loading={saving} onClick={() => void toggleBookmark()}>
          <i className={`fa-${bookmarked ? 'solid' : 'regular'} fa-bookmark`} aria-hidden="true" />{bookmarked ? '已加入书签' : '章节书签'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPanelOpen(true)}><i className="fa-solid fa-note-sticky" aria-hidden="true" />本章标注 {items.filter((item) => item.kind !== 'bookmark').length}</Button>
        <span className="text-xs text-slate-400">选中正文即可添加划线或私人笔记</span>
      </div>
      {selectionToolbar}

      <Modal open={panelOpen} onClose={() => setPanelOpen(false)} title="本章私人标注" className="max-w-2xl">
        {loading ? <Loading label="正在加载私人标注…" /> : items.filter((item) => item.kind !== 'bookmark').length === 0 ? (
          <EmptyState>选中章节正文后即可创建划线或私人笔记</EmptyState>
        ) : (
          <div className="space-y-3">
            {items.filter((item) => item.kind !== 'bookmark').map((item) => (
              <Card key={item.id} className="p-4 shadow-none">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={item.kind === 'note' ? 'primary' : 'amber'}>{item.kind === 'note' ? '私人笔记' : '划线'}</Badge>
                      {item.anchor_status === 'orphaned' && <Badge tone="rose">原文位置已失效</Badge>}
                      {item.anchor_status === 'relocated' && <Badge tone="slate">已重新定位</Badge>}
                    </div>
                    <blockquote className="border-l-2 border-primary-300 pl-3 text-sm leading-6 text-slate-600">{item.quote}</blockquote>
                    {item.note && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.note}</p>}
                    <p className="mt-2 text-xs text-slate-400">{formatDate(item.updated_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.kind === 'note' && <Tooltip content="编辑笔记"><button type="button" aria-label="编辑笔记"
                      className="flex items-center justify-center rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                      style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}
                      onClick={() => { setNote(item.note); setEditing({ annotation: item, selection: null }) }}><i className="fa-solid fa-pen" aria-hidden="true" /></button></Tooltip>}
                    <Tooltip content="删除标注"><button type="button" aria-label="删除标注"
                      className="flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}
                      onClick={() => void remove(item)}><i className="fa-solid fa-trash" aria-hidden="true" /></button></Tooltip>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        <div className="mt-4 text-right"><Link href="/user/notes" className="text-sm font-medium text-primary-600 hover:text-primary-700">查看我的全部笔记</Link></div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => { setEditing(null); setNote('') }} title={editing?.annotation ? '编辑私人笔记' : '添加私人笔记'}
        footer={<><Button variant="ghost" onClick={() => { setEditing(null); setNote('') }}>取消</Button><Button loading={saving} disabled={!note.trim()} onClick={() => void saveNote()}>保存笔记</Button></>}>
        {editing?.selection && <blockquote className="mb-4 max-h-28 overflow-y-auto break-words border-l-2 border-primary-300 pl-3 text-sm leading-6 text-slate-500">{editing.selection.quote}</blockquote>}
        <Textarea rows={6} value={note} maxLength={10000} placeholder="记录你的想法，仅自己可见" onChange={(event) => setNote(event.target.value)} />
        <p className="mt-2 text-right text-xs text-slate-400">{note.length}/10000</p>
      </Modal>
    </>
  )
}
