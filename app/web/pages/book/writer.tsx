import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { renderMarkdown } from '@/lib/markdown'
import DocTree from '@/components/DocTree'
import { StatusBadge } from '@/components/BookCard'
import type { Book, Document, BookStatus } from '@/lib/types'

// Writer：左侧章节树管理，右侧 Markdown 编辑器
export default function Writer() {
  const user = useRequireAuth()
  const router = useRouter()
  const bookSlug = (router.query.slug as string) || ''
  const docSlug = (router.query.doc as string) || ''

  const [book, setBook] = useState<Book | null>(null)
  const [tree, setTree] = useState<Document[]>([])
  const [current, setCurrent] = useState<Document | null>(null) // null = 新建
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // 表单状态
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<BookStatus>('draft')
  const [parentId, setParentId] = useState<string>('')
  const [sortOrder, setSortOrder] = useState(0)

  const flatDocs = useMemo(() => flatten(tree), [tree])

  const loadTree = useCallback(async (b: Book) => {
    setTree(await api<Document[]>(`/books/${b.id}/documents`))
  }, [])

  useEffect(() => {
    if (!user || !bookSlug) return
    api<Book>(`/books/slug/${encodeURIComponent(bookSlug)}`)
      .then(async (b) => {
        setBook(b)
        await loadTree(b)
      })
      .catch((e) => alert((e as Error).message))
  }, [user, bookSlug, loadTree])

  // 选中已有文档时填充表单
  useEffect(() => {
    if (!flatDocs.length && !docSlug) {
      resetForm()
      return
    }
    const doc = docSlug ? flatDocs.find((d) => d.slug === docSlug) : null
    if (doc) {
      setCurrent(doc)
      api<Document>(`/documents/${doc.id}`).then((full) => {
        setTitle(full.title)
        setContent(full.content)
        setStatus(full.status)
        setParentId(full.parent_id ? String(full.parent_id) : '')
        setSortOrder(full.sort_order)
      }).catch((e) => alert((e as Error).message))
    } else if (!docSlug) {
      resetForm()
    }
  }, [docSlug, flatDocs]) // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setCurrent(null)
    setTitle('')
    setContent('')
    setStatus('draft')
    setParentId('')
    setSortOrder(0)
  }

  function selectDoc(slug: string) {
    router.push(`/book/writer?slug=${encodeURIComponent(bookSlug)}&doc=${slug}`, undefined, { shallow: true })
  }

  async function save() {
    if (!book) return
    if (!title.trim()) return setMessage('请填写标题')
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        title: title.trim(),
        content,
        status,
        sort_order: sortOrder,
        parent_id: parentId ? Number(parentId) : null,
      }
      if (current) {
        const updated = await api<Document>(`/documents/${current.id}`, { method: 'PUT', body: payload })
        setMessage('已保存')
        setCurrent(updated)
        await loadTree(book)
        selectDoc(updated.slug)
      } else {
        const created = await api<Document>(`/books/${book.id}/documents`, { method: 'POST', body: payload })
        setMessage('创建成功')
        await loadTree(book)
        selectDoc(created.slug)
      }
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function removeDoc(doc: Document) {
    if (!book) return
    if (!confirm(`确定删除「${doc.title}」及其子章节吗？`)) return
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' })
      await loadTree(book)
      if (current?.id === doc.id) {
        resetForm()
        router.push(`/book/writer?slug=${encodeURIComponent(bookSlug)}`, undefined, { shallow: true })
      }
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function move(doc: Document, delta: -1 | 1) {
    if (!book) return
    const target = flatDocs.find((d) => d.sort_order === doc.sort_order + delta && d.parent_id === doc.parent_id)
    await api(`/documents/${doc.id}`, { method: 'PUT', body: { sort_order: doc.sort_order + delta } })
    if (target) {
      await api(`/documents/${target.id}`, { method: 'PUT', body: { sort_order: doc.sort_order } })
    }
    await loadTree(book)
  }

  if (!user) return null
  if (!book) return <p className="py-20 text-center text-slate-400">加载中…</p>

  const chapterPrefix = book.chapter_prefix || ''
  // 父文档候选：排除自身及其后代
  const byId = new Map(flatDocs.map((d) => [d.id, d]))
  function isDescendantOf(doc: Document, ancestorId: number): boolean {
    let p = doc.parent_id
    while (p !== null && p !== undefined) {
      if (p === ancestorId) return true
      p = byId.get(p)?.parent_id ?? null
    }
    return false
  }
  const parentCandidates = flatDocs.filter((d) => !current || (d.id !== current.id && !isDescendantOf(d, current.id)))

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="card h-fit p-4">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-sm font-bold text-slate-900">章节管理</h2>
          <button onClick={() => router.push(`/book/writer?slug=${encodeURIComponent(bookSlug)}`, undefined, { shallow: true })}
            className="text-sm text-primary-600 hover:underline">+ 新建</button>
        </div>
        <DocTree
          items={tree}
          activeId={current?.id}
          itemRender={(doc) => (
            <span className="flex flex-1 items-center justify-between gap-1">
              <button onClick={() => selectDoc(doc.slug)} className="flex-1 truncate text-left hover:text-primary-600">
                {chapterPrefix}{doc.title}
              </button>
              <span className="flex shrink-0 items-center opacity-40 transition hover:opacity-100">
                <button title="上移" onClick={() => move(doc, -1)} className="px-1 text-xs">↑</button>
                <button title="下移" onClick={() => move(doc, 1)} className="px-1 text-xs">↓</button>
                <button title="删除" onClick={() => removeDoc(doc)} className="px-1 text-xs text-rose-500">✕</button>
              </span>
            </span>
          )}
        />
      </aside>

      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">{current ? `编辑：${chapterPrefix}${current.title}` : '新建章节'}</h2>
          <div className="flex items-center gap-2">
            {current && <StatusBadge status={current.status} />}
            <button onClick={() => setPreview(!preview)} className="btn-outline px-3 py-1.5 text-sm">
              {preview ? '编辑' : '预览'}
            </button>
          </div>
        </div>

        {message && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">{message}</div>}

        <div className="space-y-3">
          <input className="input text-lg font-semibold" placeholder="章节标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-3">
            <select className="input flex-1" value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
              <option value="draft">草稿</option>
              <option value="published">发布</option>
              <option value="archived">归档</option>
            </select>
            <select className="input flex-1" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">作为顶级章节</option>
              {parentCandidates.map((d) => (
                <option key={d.id} value={d.id}>父级：{chapterPrefix}{d.title}</option>
              ))}
            </select>
          </div>

          {preview ? (
            <div className="markdown-body min-h-[400px] rounded-lg border border-slate-200 p-4"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          ) : (
            <textarea
              className="input min-h-[400px] font-mono leading-6"
              placeholder="使用 Markdown 编写章节内容…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {current ? `更新于 ${formatDate(current.updated_at)}` : '新章节默认为草稿'}
            </span>
            <button onClick={save} className="btn-primary" disabled={saving}>{saving ? '保存中…' : current ? '保存修改' : '创建章节'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function flatten(docs: Document[]): Document[] {
  return docs.flatMap((d) => [d, ...flatten(d.children || [])])
}
