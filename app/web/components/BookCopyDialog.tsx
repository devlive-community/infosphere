import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { Button, Input, Modal, useFeedback } from '@/components/ui'
import { GripIcon, CloseIcon } from '@/components/icons'
import type { Book, Document } from '@/lib/types'

interface FlatDoc { id: number; title: string; level: number }

function flatten(docs: Document[], level = 0, out: FlatDoc[] = []): FlatDoc[] {
  for (const d of docs) {
    out.push({ id: d.id, title: d.title, level })
    if (d.children?.length) flatten(d.children, level + 1, out)
  }
  return out
}

// BookCopyDialog 复制书籍：完整复制（按原结构）或自定义复制（拖拽重排 / 移除章节）。
// 传入 tree 时直接用；未传入时打开后自行拉取该书章节树（供书籍列表等无 tree 的场景复用）。
export default function BookCopyDialog({ book, tree, open, onClose }: { book: Book; tree?: Document[]; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { showToast } = useFeedback()
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'full' | 'custom'>('full')
  const [items, setItems] = useState<FlatDoc[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null) // 落点位置：在该索引行之前插入；等于长度表示末尾

  useEffect(() => {
    if (!open) return
    setTitle(`${book.title} 副本`)
    setMode('full')
    if (tree) {
      const flat = flatten(tree)
      setItems(flat)
      setTotal(flat.length)
      return
    }
    api<Document[]>(`/books/${book.id}/documents`).then((docs) => {
      const flat = flatten(docs || [])
      setItems(flat)
      setTotal(flat.length)
    }).catch(() => { setItems([]); setTotal(0) })
  }, [open, book.id, book.title, tree])

  // subtreeRange 返回从 i 起、其后所有更深层级子节点构成的连续区间 [i, end)。
  function subtreeRange(list: FlatDoc[], i: number): [number, number] {
    let end = i + 1
    while (end < list.length && list[end].level > list[i].level) end++
    return [i, end]
  }

  // dragInsideSelf 落点是否落在被拖拽节点自身的子树内（拖父节点整体移动，不能拖进自身）。
  function dragInsideSelf(to: number): boolean {
    if (dragIndex === null) return false
    const [s, e] = subtreeRange(items, dragIndex)
    return to > s && to < e
  }

  function endDrag() { setDragIndex(null); setDropIndex(null) }

  function drop() {
    if (dragIndex === null || dropIndex === null || dragInsideSelf(dropIndex)) { endDrag(); return }
    const [s, e] = subtreeRange(items, dragIndex)
    const block = items.slice(s, e)
    const rest = [...items.slice(0, s), ...items.slice(e)]
    const insertAt = Math.max(0, Math.min(rest.length, dropIndex <= s ? dropIndex : dropIndex - block.length))
    rest.splice(insertAt, 0, ...block)
    setItems(rest)
    endDrag()
  }

  function removeSubtree(i: number) {
    const [s, e] = subtreeRange(items, i)
    setItems((prev) => [...prev.slice(0, s), ...prev.slice(e)])
  }

  async function submit() {
    if (mode === 'custom' && items.length === 0) return
    setBusy(true)
    try {
      const body = mode === 'full'
        ? { title: title.trim(), mode: 'full' }
        : { title: title.trim(), mode: 'custom', doc_ids: items.map((x) => x.id) }
      const d = await api<{ book: { slug: string } }>(`/books/${book.id}/copy`, { method: 'POST', body })
      showToast({ message: '已复制为新的草稿书', tone: 'success' })
      onClose()
      router.push(`/book/writer/${encodeURIComponent(d.book.slug)}`)
    } catch (e) {
      showToast({ title: '复制失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="复制书籍" className="max-w-xl"
      footer={<>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button loading={busy} disabled={mode === 'custom' && items.length === 0} onClick={submit}>
          {mode === 'full' ? `复制全部 ${total} 章` : `复制所选 ${items.length} 章`}
        </Button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">新书标题</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="副本标题" maxLength={255} />
          <p className="mt-1.5 text-xs text-slate-400">复制的书籍将作为你名下的私有草稿，含元数据与所选章节</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['full', 'custom'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-lg border p-3 text-left transition-colors ${mode === m ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <div className="text-sm font-medium text-slate-800">{m === 'full' ? '完整复制' : '自定义复制'}</div>
              <div className="mt-0.5 text-xs text-slate-400">{m === 'full' ? '按当前结构与顺序复制全部章节' : '选择、拖拽重排或移除要复制的章节'}</div>
            </button>
          ))}
        </div>

        {mode === 'custom' && (
          items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">已移除全部章节，请至少保留一章</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-slate-200" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
              {items.map((it, i) => {
                const [s, e] = dragIndex !== null ? subtreeRange(items, dragIndex) : [-1, -1]
                const dragging = dragIndex !== null && i >= s && i < e
                const showBar = dropIndex === i && !dragInsideSelf(i)
                return (
                  <li key={it.id} draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragEnd={endDrag}
                    onDragOver={(ev) => { ev.preventDefault(); if (dragIndex !== null) setDropIndex(i) }}
                    className={`relative flex items-center gap-2 border-b border-slate-100 px-3 py-2 hover:bg-slate-50 ${dragging ? 'opacity-40' : ''}`}>
                    {showBar && <span className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary-500" />}
                    <GripIcon className="h-4 w-4 shrink-0 cursor-grab text-slate-300" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700" style={{ paddingLeft: `${it.level * 14}px` }}>{it.title}</span>
                    <button type="button" onClick={() => removeSubtree(i)}
                      aria-label="移除章节（含子章节）" className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-500">
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
              {/* 末尾落点区：拖到列表底部时插到最后 */}
              <li onDragOver={(ev) => { ev.preventDefault(); if (dragIndex !== null) setDropIndex(items.length) }}
                className="relative h-3">
                {dropIndex === items.length && !dragInsideSelf(items.length) && <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary-500" />}
              </li>
            </ul>
          )
        )}
      </div>
    </Modal>
  )
}
