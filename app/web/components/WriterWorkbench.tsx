import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { api, formatDate } from '@/lib/api'
import { useApp, useRequireAuth } from '@/lib/auth'
import { renderMarkdown, bindMarkdownInteractivity } from '@/lib/markdown'
import Seo from '@/components/Seo'
import { Button, Input, Textarea, Select, Field, Badge, EmptyState, Loading, SegmentedTabs, Tooltip, useFeedback } from '@/components/ui'
import {
  BookIcon, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, CloudIcon, CodeIcon,
  CloseIcon, EyeIcon, FileTextIcon, FolderIcon, GlobeIcon, GripIcon, HistoryIcon, ImageIcon, LinkIcon,
  ListBulletIcon, ListOrderedIcon, MoreIcon, QuoteIcon, SaveIcon, SearchIcon, TrashIcon, UploadIcon,
} from '@/components/icons'
import type { Book, Document, DocumentRevision, DocumentRevisionSummary, BookStatus, DocumentStatus, PageResult } from '@/lib/types'

type SaveState = 'saved' | 'dirty' | 'saving'
type TabKey = 'toc' | 'settings'

interface BookFormState {
  title: string
  description: string
  status: BookStatus
  isPublic: boolean
  tags: string[]
  chapterPrefix: string
}

const STATUS_META: Record<BookStatus, { label: string; tone: 'slate' | 'primary' | 'emerald' | 'violet' | 'amber'; dot: string }> = {
  draft: { label: '草稿', tone: 'slate', dot: 'bg-slate-400' },
  in_progress: { label: '进行中', tone: 'primary', dot: 'bg-primary-500' },
  published: { label: '已发布', tone: 'emerald', dot: 'bg-emerald-500' },
  completed: { label: '已完成', tone: 'violet', dot: 'bg-violet-500' },
  archived: { label: '已归档', tone: 'amber', dot: 'bg-amber-500' },
}

// 临时关闭章节自动保存；恢复时只需改为 true，手动保存与发布流程不受影响。
const AUTO_SAVE_ENABLED = false

interface WriterProps {
  user: import('@/lib/types').User | null
}

// Writer：书籍与章节编辑器（三栏工作台布局）
export default function Writer({ user }: WriterProps) {
  const { confirmAction, requestInput, showToast } = useFeedback()
  useRequireAuth()
  const router = useRouter()
  const { site } = useApp()
  const bookSlug = (router.query.slug as string) || ''
  const docSlug = (router.query.doc as string) || ''
  const siteName = site.site_name || 'InfoSphere'

  const [book, setBook] = useState<Book | null>(null)
  const [tree, setTree] = useState<Document[]>([])
  const [current, setCurrent] = useState<Document | null>(null)
  const [documentLoading, setDocumentLoading] = useState(false)
  const [tab, setTab] = useState<TabKey>('toc')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: 'before' | 'inside' | 'after' } | null>(null)
  const [creatingUnder, setCreatingUnder] = useState<number | null>(null) // 新建期间保持高亮的父章节
  const [preview, setPreview] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [message, setMessage] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [webImportOpen, setWebImportOpen] = useState(false)

  // 章节表单
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<DocumentStatus>('draft')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [allowComments, setAllowComments] = useState(true)

  // 书籍设置表单
  const [bookForm, setBookForm] = useState<BookFormState>({ title: '', description: '', status: 'draft', isPublic: false, tags: [] as string[], chapterPrefix: '' })
  const [tagInput, setTagInput] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const snapshot = useRef('') // 已保存/已加载表单的快照，用于脏状态判断
  const loadedDocId = useRef<number | null>(null) // 当前表单对应的文档，防止切换章节时误触发自动保存
  const saveRef = useRef<(opts?: { status?: DocumentStatus }) => Promise<void>>(async () => {})
  const didInitExpand = useRef(false)

  const flatDocs = useMemo(() => flatten(tree), [tree])
  const previewRef = useRef<HTMLDivElement>(null)
  // 预览内容防抖：输入时避免每键全量重渲染 Markdown
  const [previewHtml, setPreviewHtml] = useState('')
  useEffect(() => {
    if (!preview) return
    const timer = setTimeout(() => {
      setPreviewHtml(renderMarkdown(content))
      if (previewRef.current) bindMarkdownInteractivity(previewRef.current)
    }, 300)
    return () => clearTimeout(timer)
  }, [content, preview])

  const loadTree = useCallback(async (b: Book) => {
    setTree((await api<Document[]>(`/books/${b.id}/documents`)) || [])
  }, [])

  // 首次加载章节树后默认展开所有含子章节的节点（只执行一次，不干扰后续手动折叠）
  useEffect(() => {
    if (didInitExpand.current || tree.length === 0) return
    didInitExpand.current = true
    const ids = new Set<number>()
    const walk = (docs: Document[]) => docs.forEach((d) => { if (d.children?.length) { ids.add(d.id); walk(d.children) } })
    walk(tree)
    setExpanded(ids)
  }, [tree])

  // 加载书籍与章节树
  useEffect(() => {
    if (!user || !bookSlug) return
    api<Book>(`/books/slug/${encodeURIComponent(bookSlug)}`)
      .then(async (b) => {
        setBookForm({
          title: b.title, description: b.description || '', status: b.status,
          isPublic: b.is_public, tags: (b.tags || []).map((t) => t.name),
          chapterPrefix: b.chapter_prefix || '',
        })
        await loadTree(b)
        setBook(b)
      })
      .catch((e) => showToast({ title: '书籍加载失败', message: (e as Error).message, tone: 'error' }))
  }, [user, bookSlug, loadTree, showToast])

  function resetForm() {
    setCurrent(null)
    setCreatingUnder(null)
    setTitle(''); setContent(''); setStatus('draft'); setParentId(''); setSortOrder(0); setAllowComments(true)
    snapshot.current = JSON.stringify(['', '', 'draft', '', 0, true])
    loadedDocId.current = null
    setSaveState('saved')
  }

  async function confirmDiscard() {
    if (saveState !== 'dirty') return true
    return confirmAction({
      title: '放弃未保存的更改',
      message: '当前章节有未保存的更改，继续后这些修改将丢失。',
      confirmLabel: '放弃并继续',
      danger: true,
    })
  }

  // 取消选中当前章节（点击目录空白处）
  async function deselect() {
    if (!current) return
    if (!await confirmDiscard()) return
    resetForm()
    router.push(`/book/writer/${encodeURIComponent(bookSlug)}`, undefined, { shallow: true })
  }

  // 选中已有章节时填充表单
  useEffect(() => {
    if (!flatDocs.length && !docSlug) { resetForm(); return }
    const doc = docSlug ? flatDocs.find((d) => d.slug === docSlug) : null
    if (doc) {
      setDocumentLoading(true)
      setCurrent(doc)
      setCreatingUnder(null)
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
      }).catch((e) => showToast({ title: '章节加载失败', message: (e as Error).message, tone: 'error' }))
        .finally(() => setDocumentLoading(false))
    } else if (!docSlug) {
      setDocumentLoading(false)
      resetForm()
    }
  }, [docSlug, flatDocs]) // eslint-disable-line react-hooks/exhaustive-deps

  // 保存：opts.status 允许“发布”一次性覆盖状态
  const save = useCallback(async (opts?: { status?: DocumentStatus }) => {
    if (!book) return
    if (!title.trim()) { setMessage('请填写章节标题'); return }
    const effectiveStatus = opts?.status ?? status
    const payload = {
      title: title.trim(), content, status: effectiveStatus, sort_order: sortOrder,
      parent_id: parentId ? Number(parentId) : null, allow_comments: allowComments,
      create_revision: Boolean(current), revision_reason: opts?.status ? 'publish' : 'save',
    }
    setSaveState('saving')
    const startedAt = Date.now()
    try {
      if (current) {
        const updated = await api<Document>(`/documents/${current.id}`, { method: 'PUT', body: payload })
        snapshot.current = JSON.stringify([updated.title, updated.content || '', updated.status, updated.parent_id ? String(updated.parent_id) : '', updated.sort_order, updated.allow_comments !== false])
        loadedDocId.current = updated.id
        setCurrent(updated)
        if (opts?.status) setStatus(opts.status)
        await loadTree(book)
        selectDoc(updated.slug, true)
      } else {
        const created = await api<Document>(`/books/${book.id}/documents`, { method: 'POST', body: payload })
        snapshot.current = JSON.stringify([created.title, created.content || '', created.status, created.parent_id ? String(created.parent_id) : '', created.sort_order, created.allow_comments !== false])
        loadedDocId.current = created.id
        setCurrent(created)
        if (opts?.status) setStatus(opts.status)
        await loadTree(book)
        selectDoc(created.slug, true)
      }
      const elapsed = Date.now() - startedAt
      if (elapsed < 500) await new Promise((r) => setTimeout(r, 500 - elapsed)) // 让“保存中”至少可见片刻
      setSaveState('saved')
    } catch (e) {
      setSaveState('dirty')
      setMessage((e as Error).message)
    }
  }, [book, title, content, status, parentId, sortOrder, allowComments, current, loadTree]) // eslint-disable-line react-hooks/exhaustive-deps
  saveRef.current = save

  // 脏状态检测；自动保存当前临时关闭，只保留手动保存、快捷键保存与发布。
  useEffect(() => {
    if (!book) return
    const key = JSON.stringify([title, content, status, parentId, sortOrder, allowComments])
    if (key === snapshot.current) { setSaveState((s) => (s === 'saving' ? s : 'saved')); return }
    if (loadedDocId.current !== null && loadedDocId.current !== current?.id) return
    if (!current && !title.trim()) return
    setSaveState('dirty')
    if (!AUTO_SAVE_ENABLED) return
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

  async function selectDoc(slug: string, force = false) {
    if (!force && slug !== current?.slug && !await confirmDiscard()) return
    // 切换章节：本页内更新地址与表单（shallow，不重载）
    router.replace(`/book/writer/${encodeURIComponent(bookSlug)}/${encodeURIComponent(slug)}`, undefined, { shallow: true })
  }

  async function publish() {
    if (!title.trim()) { setMessage('请先填写章节标题再发布'); return }
    await save({ status: 'published' })
  }

  async function removeDoc(doc: Document) {
    if (!book) return
    if (!await confirmAction({
      title: '删除章节',
      message: `确定删除「${doc.title}」及其子章节吗？此操作不可撤销。`,
      confirmLabel: '删除章节',
      danger: true,
    })) return
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' })
      await loadTree(book)
      if (current?.id === doc.id) { resetForm(); router.push(`/book/writer/${encodeURIComponent(bookSlug)}`, undefined, { shallow: true }) }
    } catch (e) { showToast({ title: '删除失败', message: (e as Error).message, tone: 'error' }) }
  }

  async function move(doc: Document, delta: -1 | 1) {
    if (!book) return
    const target = flatDocs.find((d) => d.sort_order === doc.sort_order + delta && d.parent_id === doc.parent_id)
    await api(`/documents/${doc.id}`, { method: 'PUT', body: { sort_order: doc.sort_order + delta } })
    if (target) await api(`/documents/${target.id}`, { method: 'PUT', body: { sort_order: doc.sort_order } })
    await loadTree(book)
  }

  // 收集某节点及其所有后代 id（用于禁止把节点拖进自己的子树）
  function subtreeIds(id: number): Set<number> {
    const set = new Set<number>([id])
    const walk = (d: Document) => (d.children || []).forEach((c) => { set.add(c.id); walk(c) })
    const root = flatDocs.find((d) => d.id === id)
    if (root) walk(root)
    return set
  }

  // 拖拽移动：支持跨层级。pos=before/after 挂到目标同级，inside 作为目标的子章节
  async function moveNode(dragDocId: number, targetId: number, pos: 'before' | 'inside' | 'after') {
    if (!book || dragDocId === targetId) return
    const drag = flatDocs.find((d) => d.id === dragDocId)
    const target = flatDocs.find((d) => d.id === targetId)
    if (!drag || !target) return
    if (subtreeIds(dragDocId).has(targetId)) return // 不能拖进自身子树

    let newParent: number | null
    let siblings: Document[]
    if (pos === 'inside') {
      newParent = target.id
      siblings = (target.children || []).slice()
    } else {
      newParent = target.parent_id ?? null
      siblings = (newParent === null ? tree : flatDocs.find((d) => d.id === newParent)?.children || []).slice()
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
        if (parentChanged || d.sort_order !== i) {
          writes.push(api(`/documents/${d.id}`, { method: 'PUT', body: { parent_id: newParent, sort_order: i } }))
        }
      } else if (d.sort_order !== i) {
        writes.push(api(`/documents/${d.id}`, { method: 'PUT', body: { sort_order: i } }))
      }
    })
    if (writes.length) await Promise.all(writes)
    if (pos === 'inside') setExpanded(new Set(expanded).add(target.id)) // 展开新父级以显示移入的子章节
    await loadTree(book)
  }

  // 新建章节/子章节：有选中项时都建到该章节之下（子级）；无选中项时建到顶级
  async function createNew() {
    if (!await confirmDiscard()) return
    let newParent = ''
    let newSort = 0
    if (current) {
      newParent = String(current.id)
      newSort = current.children?.length || 0
      setExpanded(new Set(expanded).add(current.id)) // 展开父级，保存后新子章节可见
      setCreatingUnder(current.id) // 新建期间保持父章节高亮作上下文
    } else {
      setCreatingUnder(null)
    }
    setParentId(newParent); setStatus('draft')
    setCurrent(null)
    setTitle(''); setContent(''); setSortOrder(newSort); setAllowComments(true)
    snapshot.current = JSON.stringify(['', '', 'draft', newParent, newSort, true])
    loadedDocId.current = null
    setSaveState('dirty') // 新章节等待用户手动保存或发布
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function openWebImport() {
    if (!await confirmDiscard()) return
    setNewMenuOpen(false)
    setWebImportOpen(true)
  }

  async function handleWebImported(document: Document) {
    setWebImportOpen(false)
    if (document.parent_id) setExpanded((value) => new Set(value).add(document.parent_id as number))
    if (book) await loadTree(book)
    await router.push(`/book/writer/${encodeURIComponent(bookSlug)}/${encodeURIComponent(document.slug)}`, undefined, { shallow: true })
    setMessage(`已采集为草稿章节《${document.title}》`)
    setTimeout(() => setMessage(''), 2500)
  }

  async function saveBookSettings() {
    if (!book) return
    try {
      const payload = {
        title: bookForm.title.trim(), description: bookForm.description, status: bookForm.status,
        is_public: bookForm.isPublic, chapter_prefix: bookForm.chapterPrefix,
        tags: bookForm.tags,
      }
      const updated = await api<Book>(`/books/${book.id}`, { method: 'PUT', body: payload })
      setBook(updated)
      setMessage('书籍设置已保存')
      setTimeout(() => setMessage(''), 2000)
    } catch (e) { setMessage((e as Error).message) }
  }

  async function applyRestoredDocument(restored: Document) {
    setTitle(restored.title)
    setContent(restored.content || '')
    setStatus(restored.status)
    setAllowComments(restored.allow_comments !== false)
    snapshot.current = JSON.stringify([
      restored.title, restored.content || '', restored.status,
      restored.parent_id ? String(restored.parent_id) : '', restored.sort_order,
      restored.allow_comments !== false,
    ])
    loadedDocId.current = restored.id
    setCurrent(restored)
    setSaveState('saved')
    setMessage('历史版本已恢复，并已保留恢复前快照')
    if (book) await loadTree(book)
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

  async function insertLink() {
    const url = await requestInput({ title: '添加链接', label: '链接地址', defaultValue: 'https://', placeholder: 'https://example.com', confirmLabel: '插入链接' })
    if (url) wrapSelection('[', `](${url})`)
  }

  async function insertImage() {
    const url = await requestInput({ title: '添加图片', message: '请输入可公开访问的图片地址。', label: '图片地址', defaultValue: 'https://', placeholder: 'https://example.com/image.png', confirmLabel: '插入图片' })
    if (url) wrapSelection('![', `](${url})`)
  }

  async function navigateAway(href: string) {
    if (!await confirmDiscard()) return
    await router.push(href)
  }

  if (!user) return <Loading className="min-h-screen" label="正在验证编辑权限…" />

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
  const dragBlocked = dragId != null ? subtreeIds(dragId) : null

  if (!book) {
    return (
      <div className="flex h-screen items-center justify-center bg-warm">
        <Loading label="正在加载书籍与章节…" />
      </div>
    )
  }

  const titleText = current ? `${chapterPrefix}${current.title} · ${book.title}` : `新建章节 · ${book.title}`

  const filteredTree = search.trim() ? filterTree(tree, search.trim()) : tree

  return (
    <div className="flex h-screen flex-col bg-warm">
      <Seo siteName={siteName} title={titleText} noindex />
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link href="/" onClick={(event) => { event.preventDefault(); navigateAway('/') }} className="flex shrink-0 items-center gap-2 font-bold text-slate-900">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
            {siteName}
          </Link>
          <span className="text-slate-300">/</span>
          <Link href="/books" onClick={(event) => { event.preventDefault(); navigateAway('/books') }} className="shrink-0 text-slate-500 hover:text-primary-600">我的书籍</Link>
          <span className="text-slate-300">/</span>
          <span className="truncate font-medium text-slate-900">{book.title}</span>
        </div>
        <div className="hidden items-center gap-1.5 text-sm text-slate-400 md:flex">
          {saveState === 'saved' && <><CheckCircleIcon className="h-4 w-4 text-emerald-500" /> 所有更改已保存</>}
          {saveState === 'dirty' && <><CloudIcon className="h-4 w-4 text-amber-500" /> 未保存的更改</>}
          {saveState === 'saving' && <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" /> <span className="text-primary-600">保存中…</span></>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={() => setHistoryOpen(true)} disabled={!current}>
            <HistoryIcon className="h-4 w-4" /> 历史
          </Button>
          <Button variant="ghost" onClick={() => setPreview(!preview)}>
            <EyeIcon className="h-4 w-4" /> {preview ? '编辑' : '预览'}
          </Button>
          <Button variant="outline" onClick={() => saveRef.current()} disabled={saveState === 'saving'}>
            <SaveIcon className="h-4 w-4" /> {saveState === 'saving' ? '保存中…' : '保存'}
          </Button>
          <Button onClick={publish} disabled={saveState === 'saving'}>
            <UploadIcon className="h-4 w-4" /> 发布
          </Button>
        </div>
      </header>

      {/* 透明遮罩：任一浮层菜单打开时点击外部即关闭（菜单层级更高，不受影响） */}
      {(newMenuOpen || menuFor !== null) && (
        <div className="fixed inset-0 z-10" onClick={() => { setNewMenuOpen(false); setMenuFor(null) }} />
      )}

      <div className="flex min-h-0 flex-1">
        {/* 左栏：书籍与章节树 */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 p-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-[#8B8DFF]">
              {book.cover_image && <img src={book.cover_image} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{book.title}</div>
              <div className="mt-1"><Badge tone={STATUS_META[book.status].tone}>{STATUS_META[book.status].label}</Badge></div>
            </div>
          </div>

          <div className="px-3 pt-3">
            <SegmentedTabs fullWidth size="sm" value={tab} ariaLabel="编辑器侧栏"
              onChange={(value) => setTab(value as TabKey)} items={[
                { value: 'toc', label: '目录' },
                { value: 'settings', label: '书籍设置' },
              ]} />
          </div>

          {tab === 'toc' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-3">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" placeholder="搜索章节" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="relative mt-2.5">
                  <button onClick={() => createNew()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary-500 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
                    style={{ height: 'var(--control-height)' }}>
                    + 新建章节
                  </button>
                  <button onClick={() => setNewMenuOpen(!newMenuOpen)} aria-label="更多创建方式"
                    className="absolute right-1 top-1 flex items-center justify-center rounded-md text-primary-600 hover:bg-primary-50"
                    style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}>
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  {newMenuOpen && (
                    <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <button onClick={() => { createNew(); setNewMenuOpen(false) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><FileTextIcon className="h-4 w-4 text-slate-400" /> 新建章节</button>
                      <button onClick={() => { setNewMenuOpen(false); if (!current) { setMessage('请先选择一个章节作为父级'); return } createNew() }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><FolderIcon className="h-4 w-4 text-slate-400" /> 新建子章节</button>
                      <button onClick={openWebImport} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"><GlobeIcon className="h-4 w-4 text-slate-400" /> 从网页采集</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto px-3 pb-2"
                onClick={(e) => { if (e.target === e.currentTarget) deselect() }}>
                {filteredTree.length === 0 ? (
                  <EmptyState>{search ? '没有匹配的章节' : '暂无章节'}</EmptyState>
                ) : (
                  <TreeItems items={filteredTree} search={search.trim()} expanded={expanded} setExpanded={setExpanded}
                    currentId={current?.id ?? creatingUnder ?? undefined} chapterPrefix={chapterPrefix}
                    onSelect={selectDoc} onMove={move} onDelete={removeDoc}
                    menuFor={menuFor} setMenuFor={setMenuFor}
                    dragEnabled={!search.trim()} dragId={dragId} dragBlocked={dragBlocked} dropTarget={dropTarget}
                    onDragStartItem={(d) => setDragId(d.id)}
                    onDragOverItem={(d, pos) => setDropTarget({ id: d.id, pos })}
                    onDropItem={(d) => { if (dragId != null && dropTarget) moveNode(dragId, d.id, dropTarget.pos); setDragId(null); setDropTarget(null) }}
                    onDragEndItem={() => { setDragId(null); setDropTarget(null) }} />
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
                <Select value={bookForm.status} onChange={(v) => setBookForm({ ...bookForm, status: v as BookStatus })}
                  options={[
                    { value: 'draft', label: '草稿' }, { value: 'in_progress', label: '进行中' },
                    { value: 'published', label: '已发布' }, { value: 'completed', label: '已完成' },
                    { value: 'archived', label: '已归档' },
                  ]} />
              </Field>
              <Field label="可见性">
                <div className="grid grid-cols-2 gap-2">
                  <VisibilityCard active={!bookForm.isPublic} onClick={() => setBookForm({ ...bookForm, isPublic: false })} title="仅自己可见" desc="尚未完成的内容" />
                  <VisibilityCard active={bookForm.isPublic} onClick={() => setBookForm({ ...bookForm, isPublic: true })} title="公开访问" desc="所有访客可阅读" />
                </div>
              </Field>
              <Field label="标签" hint="回车添加，最多 10 个">
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-colors focus-within:border-primary-500">
                  {bookForm.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200">
                      {t}
                      <button type="button" aria-label={`移除 ${t}`} onClick={() => setBookForm({ ...bookForm, tags: bookForm.tags.filter((x) => x !== t) })}
                        className="text-primary-400 hover:text-primary-700"><CloseIcon className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); const t = tagInput.trim(); if (t && !bookForm.tags.includes(t) && bookForm.tags.length < 10) { setBookForm({ ...bookForm, tags: [...bookForm.tags, t] }) } setTagInput('') }
                      else if (e.key === 'Backspace' && !tagInput && bookForm.tags.length) { setBookForm({ ...bookForm, tags: bookForm.tags.slice(0, -1) }) }
                    }}
                    onBlur={() => { const t = tagInput.trim(); if (t && !bookForm.tags.includes(t) && bookForm.tags.length < 10) { setBookForm({ ...bookForm, tags: [...bookForm.tags, t] }) } setTagInput('') }}
                    placeholder={bookForm.tags.length >= 10 ? '已达上限' : '添加标签'}
                    disabled={bookForm.tags.length >= 10}
                    className="min-w-[100px] flex-1 border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-0" />
                </div>
              </Field>
              <Field label="章节前缀"><Input value={bookForm.chapterPrefix} onChange={(e) => setBookForm({ ...bookForm, chapterPrefix: e.target.value })} placeholder="第" /></Field>
              <Button className="w-full" onClick={saveBookSettings}>保存书籍设置</Button>
            </div>
          )}
        </aside>

        {/* 中栏：编辑器 */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {documentLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
              <Loading label="正在加载章节内容…" />
            </div>
          )}
          <div className="flex min-h-0 w-full flex-1 flex-col px-8 py-6">
            {parentDoc && (
              <p className="mb-1 shrink-0 text-sm text-slate-400">{chapterPrefix}{parentDoc.title}</p>
            )}
            {/* 标题：原生输入，无边框，避免与 Input 组件的 border 样式冲突 */}
            <input
              className="w-full shrink-0 border-0 bg-transparent p-0 text-3xl font-bold text-ink placeholder:text-slate-300 focus:outline-none focus:ring-0"
              placeholder="章节标题" value={title} onChange={(e) => setTitle(e.target.value)} />

            {/* 编辑卡片：工具条 + 正文 + 底栏合为一个圆角边框，宽高跟随中列 */}
            <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              {!preview && (
                <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-1.5">
                  <ToolbarSelect onPick={(prefix) => insertAtLineStart(prefix)} />
                  <ToolbarDivider />
                  <ToolbarButton title="加粗" onClick={() => wrapSelection('**')}><span className="font-bold">B</span></ToolbarButton>
                  <ToolbarButton title="斜体" onClick={() => wrapSelection('*')}><span className="italic">I</span></ToolbarButton>
                  <ToolbarDivider />
                  <ToolbarButton title="链接" onClick={insertLink}><LinkIcon className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton title="引用" onClick={() => insertAtLineStart('> ')}><QuoteIcon className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton title="行内代码" onClick={() => wrapSelection('`')}><CodeIcon className="h-4 w-4" /></ToolbarButton>
                  <ToolbarDivider />
                  <ToolbarButton title="无序列表" onClick={() => insertAtLineStart('- ')}><ListBulletIcon className="h-4 w-4" /></ToolbarButton>
                  <ToolbarButton title="有序列表" onClick={() => insertAtLineStart('1. ')}><ListOrderedIcon className="h-4 w-4" /></ToolbarButton>
                  <ToolbarDivider />
                  <ToolbarButton title="图片" onClick={insertImage}><ImageIcon className="h-4 w-4" /></ToolbarButton>
                </div>
              )}

              {/* 正文：铺满剩余高度，内部滚动 */}
              {preview ? (
                <div ref={previewRef}
                  className="markdown-body min-h-0 flex-1 overflow-y-auto px-6 py-5"
                  dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <textarea ref={textareaRef}
                  className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-6 py-5 font-mono text-sm leading-7 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                  placeholder="使用 Markdown 编写章节内容…" value={content} onChange={(e) => setContent(e.target.value)} />
              )}

              <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs text-slate-400">
                <span className="flex items-center gap-1">Markdown <ChevronDownIcon className="h-3.5 w-3.5" /></span>
                <span>{wordCount} 字</span>
                {current ? <span>更新于 {formatDate(current.updated_at).slice(11)}</span> : <span />}
              </div>
            </div>
          </div>
        </main>

        {/* 右栏：章节设置 */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 xl:block">
          <h2 className="mb-4 font-bold text-slate-900">章节设置</h2>
          <div className="space-y-4">
            <Field label="发布状态">
              <Select value={status} onChange={(v) => setStatus(v as DocumentStatus)}
                leading={<span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[status].dot}`} />}
                options={[{ value: 'draft', label: '草稿' }, { value: 'published', label: '已发布' }, { value: 'archived', label: '已归档' }]} />
            </Field>
            <Field label="父级章节">
              <Select value={parentId} onChange={(v) => setParentId(v)}
                options={[{ value: '', label: '作为顶级章节' }, ...parentCandidates.map((d) => ({ value: String(d.id), label: `${chapterPrefix}${d.title}` }))]} />
            </Field>
            <Field label="排序">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
            </Field>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">公开后允许评论</span>
              <button role="switch" aria-checked={allowComments} onClick={() => setAllowComments(!allowComments)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${allowComments ? 'bg-primary-500' : 'bg-slate-300'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${allowComments ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="mb-3 font-semibold text-slate-900">本章信息</h3>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-400">创建时间</dt><dd className="mt-0.5 text-slate-700">{current ? formatDate(current.created_at) : '-'}</dd></div>
              <div><dt className="text-slate-400">更新时间</dt><dd className="mt-0.5 text-slate-700">{current ? formatDate(current.updated_at) : '-'}</dd></div>
            </dl>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <Button variant="outline" className="w-full" onClick={() => setHistoryOpen(true)} disabled={!current}>
              <HistoryIcon className="h-4 w-4" /> 查看版本历史
            </Button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <button onClick={() => current && removeDoc(current)} disabled={!current}
              className="flex items-center gap-1.5 text-sm text-rose-500 transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40">
              <TrashIcon className="h-4 w-4" /> 删除本章
            </button>
          </div>
        </aside>
      </div>
      <RevisionDrawer
        open={historyOpen}
        document={current}
        currentContent={content}
        hasUnsavedChanges={saveState === 'dirty'}
        onClose={() => setHistoryOpen(false)}
        onRestored={applyRestoredDocument}
      />
      {book && (
        <WebDocumentImportDialog
          open={webImportOpen}
          bookId={book.id}
          parent={current}
          topLevelCount={tree.length}
          onClose={() => setWebImportOpen(false)}
          onImported={handleWebImported}
        />
      )}
    </div>
  )
}

/* ── 子组件 ── */

const REVISION_REASON_LABEL: Record<DocumentRevisionSummary['reason'], string> = {
  create: '创建章节',
  save: '手动保存',
  publish: '发布版本',
  pre_restore: '恢复前备份',
  restore: '恢复完成',
}

type WebRenderMode = 'auto' | 'static' | 'browser'

function WebDocumentImportDialog({ open, bookId, parent, topLevelCount, onClose, onImported }: {
  open: boolean
  bookId: number
  parent: Document | null
  topLevelCount: number
  onClose: () => void
  onImported: (document: Document) => Promise<void>
}) {
  const [url, setURL] = useState('')
  const [title, setTitle] = useState('')
  const [renderMode, setRenderMode] = useState<WebRenderMode>('auto')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setURL('')
    setTitle('')
    setRenderMode('auto')
    setError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  if (!open) return null

  async function collect() {
    if (!url.trim()) {
      setError('请输入要采集的网页地址')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await api<{ document: Document }>(`/books/${bookId}/documents/import-web`, {
        method: 'POST',
        body: {
          url: url.trim(), title: title.trim(), render_mode: renderMode,
          parent_id: parent?.id ?? null,
          sort_order: parent ? parent.children?.length || 0 : topLevelCount,
        },
      })
      await onImported(result.document)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
      role="dialog" aria-modal="true" aria-label="从网页采集章节"
      onMouseDown={(event) => { if (!loading && event.target === event.currentTarget) onClose() }}>
      <section className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <GlobeIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">从网页采集章节</h2>
              <p className="mt-1 text-sm text-slate-500">
                {parent ? `将作为《${parent.title}》的子章节保存` : '将作为顶级章节保存'}，默认保持草稿状态。
              </p>
            </div>
          </div>
          <button type="button" aria-label="关闭网页采集" disabled={loading} onClick={onClose}
            className="flex items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
            style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <Field label="网页地址" hint="自动提取正文，导航、页头、页脚、侧栏、广告、评论与相关推荐不会写入章节。">
            <Input type="url" value={url} onChange={(event) => setURL(event.target.value)}
              placeholder="https://example.com/article" leading={<GlobeIcon className="h-4 w-4" />} />
          </Field>
          <Field label={<>章节标题 <span className="font-normal text-slate-400">（可选）</span></>} hint="留空时使用网页标题。">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="使用网页标题" />
          </Field>
          <Field label="解析方式">
            <Select menuPlacement="top" value={renderMode} onChange={(value) => setRenderMode(value as WebRenderMode)} options={[
              { value: 'auto', label: '自动识别（推荐）' },
              { value: 'static', label: '仅静态抓取' },
              { value: 'browser', label: '使用浏览器运行 JavaScript' },
            ]} />
          </Field>

          {error && <div role="alert" className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-600 [overflow-wrap:anywhere]">{error}</div>}
          {loading && <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-4"><Loading className="py-1" label="正在提取网页正文并构建章节…" /></div>}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <Button variant="outline" disabled={loading} onClick={onClose}>取消</Button>
            <Button loading={loading} onClick={collect}>采集为章节</Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function RevisionDrawer({
  open, document, currentContent, hasUnsavedChanges, onClose, onRestored,
}: {
  open: boolean
  document: Document | null
  currentContent: string
  hasUnsavedChanges: boolean
  onClose: () => void
  onRestored: (document: Document) => Promise<void>
}) {
  const { confirmAction } = useFeedback()
  const [result, setResult] = useState<PageResult<DocumentRevisionSummary> | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<DocumentRevision | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(async () => {
    if (!document) return
    setListLoading(true)
    setError('')
    try {
      const next = await api<PageResult<DocumentRevisionSummary>>(`/documents/${document.id}/revisions`, { params: { page_size: 50 } })
      setResult(next)
      setSelectedId((currentId) => next.items.some((item) => item.id === currentId) ? currentId : next.items[0]?.id ?? null)
    } catch (e) {
      setError((e as Error).message)
      setResult({ items: [], total: 0, page: 1, page_size: 50 })
    } finally {
      setListLoading(false)
    }
  }, [document])

  useEffect(() => {
    if (!open || !document) return
    setDetail(null)
    setSelectedId(null)
    loadList()
  }, [open, document, loadList])

  useEffect(() => {
    if (!open || !document || selectedId == null) { setDetail(null); return }
    let active = true
    setDetailLoading(true)
    setError('')
    api<DocumentRevision>(`/documents/${document.id}/revisions/${selectedId}`)
      .then((value) => { if (active) setDetail(value) })
      .catch((e) => { if (active) { setDetail(null); setError((e as Error).message) } })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [open, document, selectedId])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !document) return null

  async function restore() {
    if (hasUnsavedChanges) {
      setError('当前编辑内容尚未保存。请关闭版本历史并先手动保存，再执行恢复。')
      return
    }
    if (!detail || !await confirmAction({
      title: '恢复历史版本',
      message: `确定恢复到 ${formatDate(detail.created_at)} 的版本吗？当前内容会先自动备份。`,
      confirmLabel: '恢复版本',
    })) return
    setRestoring(true)
    setError('')
    try {
      const restored = await api<Document>(`/documents/${document!.id}/revisions/${detail.id}/restore`, { method: 'POST' })
      await onRestored(restored)
      await loadList()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRestoring(false)
    }
  }

  async function loadMore() {
    if (!document || !result || result.items.length >= result.total) return
    setLoadingMore(true)
    setError('')
    try {
      const next = await api<PageResult<DocumentRevisionSummary>>(`/documents/${document.id}/revisions`, {
        params: { page: result.page + 1, page_size: 50 },
      })
      setResult({ ...next, items: [...result.items, ...next.items] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  const difference = detail ? detail.content_length - Array.from(currentContent).length : 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label="章节版本历史" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <HistoryIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-bold text-slate-900">版本历史</h2>
              <p className="truncate text-xs text-slate-500">{document.title} · 每次手动保存均生成版本</p>
            </div>
          </div>
          <button type="button" aria-label="关闭版本历史" onClick={onClose}
            className="flex items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        {error && <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700">{error}</div>}

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="h-52 shrink-0 overflow-y-auto border-b border-slate-200 bg-slate-50/70 p-3 md:h-auto md:w-72 md:border-b-0 md:border-r">
            {listLoading ? (
              <Loading className="h-full py-8" label="正在加载版本…" />
            ) : !result?.items.length ? (
              <EmptyState>暂无历史版本</EmptyState>
            ) : (
              <div className="space-y-1.5">
                {result.items.map((revision) => (
                  <button key={revision.id} type="button" onClick={() => setSelectedId(revision.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selectedId === revision.id ? 'border-primary-200 bg-white shadow-sm ring-1 ring-primary-100' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold ${selectedId === revision.id ? 'text-primary-700' : 'text-slate-800'}`}>{REVISION_REASON_LABEL[revision.reason]}</span>
                      <span className="text-[11px] text-slate-400">{revision.content_length} 字</span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{formatDate(revision.created_at)}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">{revision.author?.username || '未知用户'}</span>
                  </button>
                ))}
                {result.items.length < result.total && (
                  <Button variant="ghost" size="sm" className="w-full" loading={loadingMore} onClick={loadMore}>
                    加载更早版本
                  </Button>
                )}
              </div>
            )}
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {detailLoading ? (
              <Loading className="h-full" label="正在加载版本内容…" />
            ) : detail ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{REVISION_REASON_LABEL[detail.reason]}</span>
                      <Badge tone={STATUS_META[detail.status].tone}>{STATUS_META[detail.status].label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(detail.created_at)} · 相较当前 {difference === 0 ? '字数相同' : `${difference > 0 ? '多' : '少'} ${Math.abs(difference)} 字`}
                    </p>
                  </div>
                  <Button variant="outline" loading={restoring} disabled={hasUnsavedChanges} onClick={restore}>
                    <HistoryIcon className="h-4 w-4" /> 恢复此版本
                  </Button>
                </div>
                {hasUnsavedChanges && (
                  <div className="border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
                    当前编辑内容尚未保存。为防止内容丢失，请先关闭面板并手动保存后再恢复。
                  </div>
                )}
                <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-200 overflow-hidden lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                  <RevisionContent title="历史版本" content={detail.content} />
                  <RevisionContent title="当前编辑内容" content={currentContent} />
                </div>
              </>
            ) : (
              <EmptyState>选择左侧版本查看内容</EmptyState>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}

function RevisionContent({ title, content }: { title: string; content: string }) {
  return (
    <section className="flex min-h-0 flex-col">
      <h3 className="shrink-0 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <pre className="min-h-0 flex-1 whitespace-pre-wrap break-words overflow-y-auto px-5 py-4 font-mono text-sm leading-6 text-slate-700">{content || '（空内容）'}</pre>
    </section>
  )
}

function VisibilityCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        active ? 'border-primary-500 bg-primary-50/60 ring-1 ring-inset ring-primary-200' : 'border-slate-200 hover:border-slate-300'
      }`}>
      <span className={`block text-sm font-medium ${active ? 'text-primary-700' : 'text-slate-900'}`}>{title}</span>
      <span className="block text-xs text-slate-500">{desc}</span>
    </button>
  )
}

function ToolbarButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={title}>
      <button type="button" aria-label={title} onClick={onClick}
        className="flex items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}>
        {children}
      </button>
    </Tooltip>
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
        className="flex items-center gap-0.5 rounded-md px-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
        style={{ height: 'var(--control-height-sm)' }}>
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
  dragEnabled: boolean
  dragId: number | null
  dragBlocked: Set<number> | null
  dropTarget: { id: number; pos: 'before' | 'inside' | 'after' } | null
  onDragStartItem: (doc: Document) => void
  onDragOverItem: (doc: Document, pos: 'before' | 'inside' | 'after') => void
  onDropItem: (doc: Document) => void
  onDragEndItem: () => void
}

// TreeItems 章节树：文件夹/文件图标、展开折叠、搜索过滤、行内菜单、同级拖拽排序
function TreeItems(props: TreeProps) {
  return (
    <ul className="min-w-max space-y-0.5">
      {props.items.map((item) => <TreeItem key={item.id} {...props} item={item} depth={0} />)}
    </ul>
  )
}

function TreeItem(props: TreeProps & { item: Document; depth: number }) {
  const {
    item, depth, search, expanded, setExpanded, currentId, chapterPrefix, onSelect, onMove, onDelete, menuFor, setMenuFor,
    dragEnabled, dragId, dragBlocked, dropTarget, onDragStartItem, onDragOverItem, onDropItem, onDragEndItem,
  } = props
  function toggleExpand() {
    const next = new Set(expanded)
    if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
    setExpanded(next)
  }
  const hasChildren = !!item.children?.length
  const isExpanded = search !== '' || expanded.has(item.id)
  const active = currentId === item.id
  const dragging = dragId === item.id
  const dropHere = dropTarget?.id === item.id

  return (
    <li>
      <div
        draggable={dragEnabled}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStartItem(item) }}
        onDragEnd={onDragEndItem}
        onDragOver={(e) => {
          if (!dragEnabled || dragId == null || dragId === item.id) return
          if (dragBlocked?.has(item.id)) return // 不能拖进自身子树
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          const y = e.clientY - rect.top
          const pos = y < rect.height * 0.3 ? 'before' : y > rect.height * 0.7 ? 'after' : 'inside'
          onDragOverItem(item, pos)
        }}
        onDrop={(e) => { e.preventDefault(); onDropItem(item) }}
        className={`group relative flex items-center rounded-lg text-sm ${active ? 'bg-primary-50 ring-1 ring-inset ring-primary-100' : 'hover:bg-slate-50'} ${dragging ? 'opacity-40' : ''}`}>
        {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-primary-500" />}
        {dropHere && dropTarget!.pos !== 'inside' && <span className={`pointer-events-none absolute inset-x-1.5 z-10 h-0.5 rounded-full bg-primary-500 ${dropTarget!.pos === 'before' ? 'top-0' : 'bottom-0'}`} />}
        {dropHere && dropTarget!.pos === 'inside' && <span className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-2 ring-inset ring-primary-400" />}
        {hasChildren ? (
          <button type="button" aria-label={isExpanded ? '折叠' : '展开'}
            onClick={(e) => { e.stopPropagation(); toggleExpand() }}
            className="ml-1 flex h-6 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600">
            {isExpanded ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="ml-1 w-5 shrink-0" />
        )}
        <button type="button" onClick={() => onSelect(item.slug)}
          className="flex flex-1 items-center gap-1.5 py-2 pl-1 pr-1 text-left">
          {hasChildren
            ? <FolderIcon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-500' : 'text-slate-400'}`} />
            : <FileTextIcon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-500' : 'text-slate-400'}`} />}
          <span className={`whitespace-nowrap ${active ? 'font-medium text-primary-700' : 'text-slate-700'}`}>{chapterPrefix}{item.title}</span>
        </button>
        <span className="mr-1 hidden shrink-0 items-center group-hover:flex">
          {dragEnabled ? (
            <Tooltip content="拖拽调整顺序">
              <span className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"><GripIcon className="h-4 w-4" /></span>
            </Tooltip>
          ) : <span className="flex h-6 w-6 cursor-default items-center justify-center rounded text-slate-400"><GripIcon className="h-4 w-4" /></span>}
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
        <ul className="ml-4 border-l border-slate-200 pl-1">
          {item.children!.map((child) => (
            <TreeItem key={child.id} {...props} item={child} depth={depth + 1} />
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
