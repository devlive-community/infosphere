import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { api, formatDate } from '@/lib/api'
import { useApp, useRequireAuth } from '@/lib/auth'
import { renderMarkdown } from '@/lib/markdown'
import { Button, Input, Textarea, Select, Field, Badge, EmptyState } from '@/components/ui'
import {
  BookIcon, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, CloudIcon, CodeIcon,
  EyeIcon, FileTextIcon, FolderIcon, GripIcon, ImageIcon, LinkIcon, ListBulletIcon,
  ListOrderedIcon, MoreIcon, QuoteIcon, SaveIcon, SearchIcon, TrashIcon, UploadIcon,
} from '@/components/icons'
import type { Book, Document, BookStatus } from '@/lib/types'

type SaveState = 'saved' | 'dirty' | 'saving'
type TabKey = 'toc' | 'settings'

interface BookFormState {
  title: string
  description: string
  status: BookStatus
  isPublic: boolean
  tags: string
  chapterPrefix: string
}

// Writer：书籍与章节编辑器（三栏工作台布局）
export default function Writer() {
  const user = useRequireAuth()
  const router = useRouter()
  const { site } = useApp()
  const bookSlug = (router.query.slug as string) || ''
  const docSlug = (router.query.doc as string) || ''
  const siteName = site.site_name || 'InfoSphere'

  const [book, setBook] = useState<Book | null>(null)
  const [tree, setTree] = useState<Document[]>([])
  const [current, setCurrent] = useState<Document | null>(null)
  const [tab, setTab] = useState<TabKey>('toc')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [message, setMessage] = useState('')

  // 章节表单
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<BookStatus>('draft')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [allowComments, setAllowComments] = useState(true)

  // 书籍设置表单
  const [bookForm, setBookForm] = useState<BookFormState>({ title: '', description: '', status: 'draft', isPublic: false, tags: '', chapterPrefix: '' })

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshot = useRef('') // 已保存/已加载表单的快照，用于脏状态判断
  const loadedDocId = useRef<number | null>(null) // 当前表单对应的文档，防止切换章节时误触发自动保存
  const saveRef = useRef<(opts?: { status?: BookStatus }) => Promise<void>>(async () => {})

  const flatDocs = useMemo(() => flatten(tree), [tree])

  const loadTree = useCallback(async (b: Book) => {
    setTree((await api<Document[]>(`/books/${b.id}/documents`)) || [])
  }, [])

  // 加载书籍与章节树
  useEffect(() => {
    if (!user || !bookSlug) return
    api<Book>(`/books/slug/${encodeURIComponent(bookSlug)}`)
      .then(async (b) => {
        setBook(b)
        setBookForm({
          title: b.title, description: b.description || '', status: b.status,
          isPublic: b.is_public, tags: (b.tags || []).map((t) => t.name).join(', '),
          chapterPrefix: b.chapter_prefix || '',
        })
        await loadTree(b)
      })
      .catch((e) => alert((e as Error).message))
  }, [user, bookSlug, loadTree])

  function resetForm() {
    setCurrent(null)
    setTitle(''); setContent(''); setStatus('draft'); setParentId(''); setSortOrder(0); setAllowComments(true)
    snapshot.current = JSON.stringify(['', '', 'draft', '', 0, true])
    loadedDocId.current = null
    setSaveState('saved')
  }

  // 选中已有章节时填充表单
  useEffect(() => {
    if (!flatDocs.length && !docSlug) { resetForm(); return }
    const doc = docSlug ? flatDocs.find((d) => d.slug === docSlug) : null
    if (doc) {
      setCurrent(doc)
      api<Document>(`/documents/${doc.id}`).then((full) => {
        setTitle(full.title)
        setContent(full.content || '')
        setStatus(full.status)
        setParentId(full.parent_id ? String(full.parent_id) : '')
        setSortOrder(full.sort_order)
        setAllowComments(full.allow_comments !== false)
        snapshot.current = JSON.stringify([full.title, full.content || '', full.status, full.parent_id ? String(full.parent_id) : '', full.sort_order, full.allow_comments !== false])
        loadedDocId.current = full.id
        setSaveState('saved')
      }).catch((e) => alert((e as Error).message))
    } else if (!docSlug) {
      resetForm()
    }
  }, [docSlug, flatDocs]) // eslint-disable-line react-hooks/exhaustive-deps

  // 保存：opts.status 允许“发布”一次性覆盖状态
  const save = useCallback(async (opts?: { status?: BookStatus }) => {
    if (!book) return
    if (!title.trim()) { setMessage('请填写章节标题'); return }
    const effectiveStatus = opts?.status ?? status
    const payload = {
      title: title.trim(), content, status: effectiveStatus, sort_order: sortOrder,
      parent_id: parentId ? Number(parentId) : null, allow_comments: allowComments,
    }
    setSaveState('saving')
    try {
      if (current) {
        const updated = await api<Document>(`/documents/${current.id}`, { method: 'PUT', body: payload })
        snapshot.current = JSON.stringify([updated.title, updated.content || '', updated.status, updated.parent_id ? String(updated.parent_id) : '', updated.sort_order, updated.allow_comments !== false])
        loadedDocId.current = updated.id
        setCurrent(updated)
        if (opts?.status) setStatus(opts.status)
        await loadTree(book)
        selectDoc(updated.slug)
      } else {
        const created = await api<Document>(`/books/${book.id}/documents`, { method: 'POST', body: payload })
        snapshot.current = JSON.stringify([created.title, created.content || '', created.status, created.parent_id ? String(created.parent_id) : '', created.sort_order, created.allow_comments !== false])
        loadedDocId.current = created.id
        setCurrent(created)
        if (opts?.status) setStatus(opts.status)
        await loadTree(book)
        selectDoc(created.slug)
      }
      setSaveState('saved')
    } catch (e) {
      setSaveState('dirty')
      setMessage((e as Error).message)
    }
  }, [book, title, content, status, parentId, sortOrder, allowComments, current, loadTree]) // eslint-disable-line react-hooks/exhaustive-deps
  saveRef.current = save

  // 脏状态 + 自动保存（新建章节需有标题才落库）
  useEffect(() => {
    if (!book) return
    const key = JSON.stringify([title, content, status, parentId, sortOrder, allowComments])
    if (key === snapshot.current) { setSaveState((s) => (s === 'saving' ? s : 'saved')); return }
    if (loadedDocId.current !== null && loadedDocId.current !== current?.id) return
    if (!current && !title.trim()) return
    setSaveState('dirty')
    const timer = setTimeout(() => { saveRef.current() }, 1500)
    return () => clearTimeout(timer)
  }, [book, title, content, status, parentId, sortOrder, allowComments, current])

  // Ctrl/Cmd + S 手动保存
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function selectDoc(slug: string) {
    router.push(`/book/writer?slug=${encodeURIComponent(bookSlug)}&doc=${slug}`, undefined, { shallow: true })
  }

  async function publish() {
    if (!title.trim()) { setMessage('请先填写章节标题再发布'); return }
    await save({ status: 'published' })
  }

  async function removeDoc(doc: Document) {
    if (!book) return
    if (!confirm(`确定删除「${doc.title}」及其子章节吗？`)) return
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' })
      await loadTree(book)
      if (current?.id === doc.id) { resetForm(); router.push(`/book/writer?slug=${encodeURIComponent(bookSlug)}`, undefined, { shallow: true }) }
    } catch (e) { alert((e as Error).message) }
  }

  async function move(doc: Document, delta: -1 | 1) {
    if (!book) return
    const target = flatDocs.find((d) => d.sort_order === doc.sort_order + delta && d.parent_id === doc.parent_id)
    await api(`/documents/${doc.id}`, { method: 'PUT', body: { sort_order: doc.sort_order + delta } })
    if (target) await api(`/documents/${target.id}`, { method: 'PUT', body: { sort_order: doc.sort_order } })
    await loadTree(book)
  }

  function createNew(asChild: boolean) {
    if (asChild && current) { setParentId(String(current.id)); setStatus('draft') }
    else { setParentId('') }
    setCurrent(null)
    setTitle(''); setContent(''); setSortOrder(0); setAllowComments(true)
    snapshot.current = JSON.stringify(['', '', 'draft', asChild && current ? String(current.id) : '', 0, true])
    loadedDocId.current = null
    setSaveState('dirty') // 标题输入后自动落库
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function saveBookSettings() {
    if (!book) return
    try {
      const payload = {
        title: bookForm.title.trim(), description: bookForm.description, status: bookForm.status,
        is_public: bookForm.isPublic, chapter_prefix: bookForm.chapterPrefix,
        tags: bookForm.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      }
      const updated = await api<Book>(`/books/${book.id}`, { method: 'PUT', body: payload })
      setBook(updated)
      setMessage('书籍设置已保存')
      setTimeout(() => setMessage(''), 2000)
    } catch (e) { setMessage((e as Error).message) }
  }

  // Markdown 工具：选区包裹 / 行首插入
  function wrapSelection(before: string, after = before) {
    const el = textareaRef.current
    if (!el) return
    const s = el.selectionStart, e = el.selectionEnd, value = el.value
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e)
    setContent(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, e + before.length) })
  }
  function insertAtLineStart(prefix: string) {
    const el = textareaRef.current
    if (!el) return
    const s = el.selectionStart
    const lineStart = el.value.lastIndexOf('\n', s - 1) + 1
    const next = el.value.slice(0, lineStart) + prefix + el.value.slice(lineStart)
    setContent(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length) })
  }

  if (!user) return null

  const chapterPrefix = book?.chapter_prefix || ''
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
  const parentDoc = parentId ? flatDocs.find((d) => String(d.id) === parentId) : null
  const wordCount = content.replace(/\s/g, '').length

  if (!book) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        <span className="animate-pulse">加载中…</span>
      </div>
    )
  }

  const filteredTree = search.trim() ? filterTree(tree, search.trim()) : tree

  return (
    <div className="flex h-screen flex-col bg-warm">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-slate-900">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
            {siteName}
          </Link>
          <span className="text-slate-300">/</span>
          <Link href="/books" className="shrink-0 text-slate-500 hover:text-primary-600">我的书籍</Link>
          <span className="text-slate-300">/</span>
          <span className="truncate font-medium text-slate-900">{book.title}</span>
        </div>
        <div className="hidden items-center gap-1.5 text-sm text-slate-400 md:flex">
          {saveState === 'saved' && <><CheckCircleIcon className="h-4 w-4 text-emerald-500" /> 所有更改已保存</>}
          {saveState === 'dirty' && <><CloudIcon className="h-4 w-4 text-amber-500" /> 未保存的更改</>}
          {saveState === 'saving' && <span className="animate-pulse">正在保存…</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={() => setPreview(!preview)}>
            <EyeIcon className="h-4 w-4" /> {preview ? '编辑' : '预览'}
          </Button>
          <Button variant="outline" onClick={() => saveRef.current()} disabled={saveState === 'saving'}>
            <SaveIcon className="h-4 w-4" /> 保存
          </Button>
          <Button onClick={publish} disabled={saveState === 'saving'}>
            <UploadIcon className="h-4 w-4" /> 发布
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左栏：书籍与章节树 */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 p-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
              {book.cover_image && <img src={book.cover_image} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{book.title}</div>
              <div className="mt-1"><Badge tone={book.status === 'published' ? 'emerald' : 'amber'}>{book.status === 'published' ? '已发布' : book.status === 'draft' ? '草稿' : '已归档'}</Badge></div>
            </div>
          </div>

          <div className="flex border-b border-slate-100 px-4 text-sm font-medium">
            {([['toc', '目录'], ['settings', '书籍设置']] as [TabKey, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-3 py-2.5 transition-colors ${tab === key ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'toc' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-3">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="h-9 pl-9" placeholder="搜索章节" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="relative mt-2.5">
                  <button onClick={() => createNew(false)}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-primary-500 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50">
                    + 新建章节
                  </button>
                  <button onClick={() => setNewMenuOpen(!newMenuOpen)} aria-label="更多创建方式"
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md text-primary-600 hover:bg-primary-50">
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  {newMenuOpen && (
                    <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <button onClick={() => { createNew(false); setNewMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><FileTextIcon className="h-4 w-4 text-slate-400" /> 新建章节</button>
                      <button onClick={() => { if (!current) { setMessage('请先选择一个章节作为父级'); return } createNew(true); setNewMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><FolderIcon className="h-4 w-4 text-slate-400" /> 新建子章节</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                {filteredTree.length === 0 ? (
                  <EmptyState>{search ? '没有匹配的章节' : '暂无章节'}</EmptyState>
                ) : (
                  <TreeItems items={filteredTree} search={search.trim()} expanded={expanded} setExpanded={setExpanded}
                    currentId={current?.id} chapterPrefix={chapterPrefix}
                    onSelect={selectDoc} onMove={move} onDelete={removeDoc}
                    menuFor={menuFor} setMenuFor={setMenuFor} />
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
                <ListBulletIcon className="h-4 w-4" /> {flatDocs.length} 个章节
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
              <Field label="书籍标题"><Input value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} /></Field>
              <Field label="简介"><Textarea className="min-h-[72px]" value={bookForm.description} onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })} /></Field>
              <Field label="状态">
                <Select value={bookForm.status} onChange={(e) => setBookForm({ ...bookForm, status: e.target.value as BookStatus })}
                  options={[{ value: 'draft', label: '草稿' }, { value: 'published', label: '已发布' }, { value: 'archived', label: '已归档' }]} />
              </Field>
              <Field label="可见性">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={bookForm.isPublic} onChange={(e) => setBookForm({ ...bookForm, isPublic: e.target.checked })} />
                  公开可访问
                </label>
              </Field>
              <Field label="标签" hint="逗号分隔，最多 10 个"><Input value={bookForm.tags} onChange={(e) => setBookForm({ ...bookForm, tags: e.target.value })} placeholder="Go, 后端" /></Field>
              <Field label="章节前缀"><Input value={bookForm.chapterPrefix} onChange={(e) => setBookForm({ ...bookForm, chapterPrefix: e.target.value })} placeholder="第" /></Field>
              <Button className="w-full" onClick={saveBookSettings}>保存书籍设置</Button>
            </div>
          )}
        </aside>

        {/* 中栏：编辑器 */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            {parentDoc && (
              <p className="mb-1 text-sm text-slate-400">{chapterPrefix}{parentDoc.title}</p>
            )}
            <Input className="h-auto border-0 bg-transparent px-0 text-3xl font-bold text-ink placeholder:text-slate-300 focus:outline-none"
              placeholder="章节标题" value={title} onChange={(e) => setTitle(e.target.value)} />

            {/* Markdown 工具条 */}
            {!preview && (
              <div className="mt-5 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                <ToolbarSelect onPick={(prefix) => insertAtLineStart(prefix)} />
                <ToolbarDivider />
                <ToolbarButton title="加粗" onClick={() => wrapSelection('**')}><span className="font-bold">B</span></ToolbarButton>
                <ToolbarButton title="斜体" onClick={() => wrapSelection('*')}><span className="italic">I</span></ToolbarButton>
                <ToolbarDivider />
                <ToolbarButton title="链接" onClick={() => wrapSelection('[', `](${window.prompt('链接地址', 'https://') || ''})`)}><LinkIcon className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton title="引用" onClick={() => insertAtLineStart('> ')}><QuoteIcon className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton title="行内代码" onClick={() => wrapSelection('`')}><CodeIcon className="h-4 w-4" /></ToolbarButton>
                <ToolbarDivider />
                <ToolbarButton title="无序列表" onClick={() => insertAtLineStart('- ')}><ListBulletIcon className="h-4 w-4" /></ToolbarButton>
                <ToolbarButton title="有序列表" onClick={() => insertAtLineStart('1. ')}><ListOrderedIcon className="h-4 w-4" /></ToolbarButton>
                <ToolbarDivider />
                <ToolbarButton title="图片" onClick={() => wrapSelection('![', `](${window.prompt('图片地址', 'https://') || ''})`)}><ImageIcon className="h-4 w-4" /></ToolbarButton>
              </div>
            )}

            {preview ? (
              <div className="markdown-body min-h-[420px] rounded-xl border border-slate-200 bg-white p-6"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
            ) : (
              <Textarea ref={textareaRef} className="mt-4 min-h-[440px] rounded-xl font-mono leading-7"
                placeholder="使用 Markdown 编写章节内容…" value={content} onChange={(e) => setContent(e.target.value)} />
            )}

            <div className="flex items-center justify-between py-3 text-xs text-slate-400">
              <span>Markdown</span>
              <span className="flex items-center gap-4">
                <span>{wordCount} 字</span>
                {current && <span>更新于 {formatDate(current.updated_at).slice(11)}</span>}
              </span>
            </div>
          </div>
        </main>

        {/* 右栏：章节设置 */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 xl:block">
          <h2 className="mb-4 font-bold text-slate-900">章节设置</h2>
          <div className="space-y-4">
            <Field label="发布状态">
              <div className="relative">
                <span className={`pointer-events-none absolute left-3.5 top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full ${
                  status === 'published' ? 'bg-emerald-500' : status === 'archived' ? 'bg-slate-400' : 'bg-amber-500'
                }`} />
                <Select className="pl-0" value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}
                  options={[{ value: 'draft', label: '草稿' }, { value: 'published', label: '已发布' }, { value: 'archived', label: '已归档' }]} />
              </div>
            </Field>
            <Field label="父级章节">
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}
                options={[{ value: '', label: '作为顶级章节' }, ...parentCandidates.map((d) => ({ value: String(d.id), label: `${chapterPrefix}${d.title}` }))]} />
            </Field>
            <Field label="排序">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
            </Field>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">公开后允许评论</span>
              <button role="switch" aria-checked={allowComments} onClick={() => setAllowComments(!allowComments)}
                className={`h-6 w-11 shrink-0 rounded-full transition-colors ${allowComments ? 'bg-primary-500' : 'bg-slate-300'}`}>
                <span className={`inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${allowComments ? 'translate-x-[18px]' : ''}`} />
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="mb-3 font-semibold text-slate-900">本章信息</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">创建时间</dt><dd>{current ? formatDate(current.created_at) : '-'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">更新时间</dt><dd>{current ? formatDate(current.updated_at) : '-'}</dd></div>
            </dl>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <button onClick={() => current && removeDoc(current)} disabled={!current}
              className="flex items-center gap-1.5 text-sm text-rose-500 transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40">
              <TrashIcon className="h-4 w-4" /> 删除本章
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ── 子组件 ── */

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />
}

// H ▾ 标题级别下拉
function ToolbarSelect({ onPick }: { onPick: (prefix: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-0.5 rounded-md px-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
        H <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {[['## ', '标题 2'], ['### ', '标题 3'], ['#### ', '标题 4']].map(([prefix, label]) => (
            <button key={label} onClick={() => { onPick(prefix); setOpen(false) }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

interface TreeProps {
  items: Document[]
  search: string
  expanded: Set<number>
  setExpanded: (s: Set<number>) => void
  currentId?: number
  chapterPrefix: string
  onSelect: (slug: string) => void
  onMove: (doc: Document, delta: -1 | 1) => void
  onDelete: (doc: Document) => void
  menuFor: number | null
  setMenuFor: (id: number | null) => void
}

// TreeItems 章节树：文件夹/文件图标、展开折叠、搜索过滤、行内菜单
function TreeItems(props: TreeProps) {
  return (
    <ul className="space-y-0.5">
      {props.items.map((item) => <TreeItem key={item.id} {...props} item={item} depth={0} />)}
    </ul>
  )
}

function TreeItem({ item, depth, search, expanded, setExpanded, currentId, chapterPrefix, onSelect, onMove, onDelete, menuFor, setMenuFor }: TreeProps & { item: Document; depth: number }) {
  const hasChildren = !!item.children?.length
  const isExpanded = search !== '' || expanded.has(item.id)
  const active = currentId === item.id

  return (
    <li>
      <div className={`group relative flex items-center rounded-lg text-sm ${active ? 'bg-primary-50 ring-1 ring-inset ring-primary-100' : 'hover:bg-slate-50'}`}>
        {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-primary-500" />}
        <button type="button" onClick={() => onSelect(item.slug)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-2 pr-1 text-left">
          <span className="w-4 shrink-0 text-slate-400">
            {hasChildren && (isExpanded
              ? <ChevronDownIcon className="h-3.5 w-3.5" />
              : <ChevronRightIcon className="h-3.5 w-3.5" />)}
          </span>
          {hasChildren
            ? <FolderIcon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-500' : 'text-slate-400'}`} />
            : <FileTextIcon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-500' : 'text-slate-400'}`} />}
          <span className={`truncate ${active ? 'font-medium text-primary-700' : 'text-slate-700'}`}>{chapterPrefix}{item.title}</span>
        </button>
        <span className="mr-1 hidden shrink-0 items-center group-hover:flex">
          <span className="cursor-grab text-slate-300"><GripIcon className="h-4 w-4" /></span>
          <button aria-label="章节操作" onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}
            className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700">
            <MoreIcon className="h-4 w-4" />
          </button>
        </span>
        {menuFor === item.id && (
          <div className="absolute right-1 top-9 z-20 w-28 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button onClick={() => { onMove(item, -1); setMenuFor(null) }} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">上移</button>
            <button onClick={() => { onMove(item, 1); setMenuFor(null) }} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50">下移</button>
            <button onClick={() => { onDelete(item); setMenuFor(null) }} className="block w-full px-3 py-1.5 text-left text-sm text-rose-600 hover:bg-rose-50">删除</button>
          </div>
        )}
      </div>
      {hasChildren && isExpanded && (
        <ul className="ml-5 border-l border-slate-200 pl-1">
          {item.children!.map((child) => (
            <TreeItem key={child.id} {...{ items: [], search, expanded, setExpanded, currentId, chapterPrefix, onSelect, onMove, onDelete, menuFor, setMenuFor }} item={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

// filterTree 按关键词过滤章节树（保留命中节点及其祖先链）
function filterTree(items: Document[], q: string): Document[] {
  const lower = q.toLowerCase()
  const result: Document[] = []
  for (const item of items) {
    const children = item.children ? filterTree(item.children, q) : []
    if (item.title.toLowerCase().includes(lower) || children.length > 0) {
      result.push({ ...item, children: children.length > 0 ? children : item.children })
    }
  }
  return result
}

function flatten(docs: Document[] | null | undefined): Document[] {
  return (docs || []).flatMap((d) => [d, ...flatten(d.children)])
}
