import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Seo from '@/components/Seo'
import Container from '@/components/Container'
import Link from 'next/link'
import { api, formatDate, formatNumber, API_BASE, getToken } from '@/lib/api'
import { useRequireAuth , useApp} from '@/lib/auth'
import { Button, ButtonLink, Badge, DropdownMenu, EmptyState, Field, Input, Pagination, SegmentedTabs, Select, Loading, Tooltip, useFeedback } from '@/components/ui'
import BookCard from '@/components/BookCard'
import PDFReimportPanel from '@/components/PDFReimportPanel'
import {
  CalendarIcon, CloseIcon, EyeIcon, FileTextIcon, GearIcon, GlobeIcon, GridIcon,
  ListIcon, PencilIcon, SearchIcon, UploadIcon,
} from '@/components/icons'
import type { Book, Document, PageResult } from '@/lib/types'

const statusTabs = [
  { key: '', label: '全部' },
  { key: 'in_progress', label: '进行中' },
  { key: 'published', label: '已发布' },
  { key: 'completed', label: '已完成' },
  { key: 'draft', label: '草稿' },
  { key: 'archived', label: '已归档' },
]

type SortKey = 'updated' | 'created' | 'views' | 'title'

const sortOptions = [
  { value: 'updated', label: '最近更新' },
  { value: 'created', label: '创建时间' },
  { value: 'views', label: '浏览最多' },
  { value: 'title', label: '标题排序' },
]

function relativeUpdated(input: string | null | undefined): string {
  if (!input) return '-'
  const diff = Date.now() - new Date(input).getTime()
  const day = 86400000
  if (diff < 3600000) return '刚刚更新'
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前更新`
  if (diff < day * 2) return '1 天前更新'
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前更新`
  return `${fmtDay(input)} 更新`
}

function fmtDay(input: string | null | undefined): string {
  return input ? input.slice(0, 10) : '-'
}

function chapterCount(book: Book): number {
  return (book.tags?.length ?? 0) + 0 || 0
}

export default function MyBooks() {
  const { confirmAction, requestInput, showToast } = useFeedback()
  const user = useRequireAuth()
  const router = useRouter()
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [status, setStatus] = useState('')
  const scope: 'owned' | 'collaborating' = router.query.scope === 'collaborating' ? 'collaborating' : 'owned'
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [data, setData] = useState<PageResult<Book>>({ items: [], total: 0, page: 1, page_size: 10 })
  const [counts, setCounts] = useState<Record<string, number>>({
    '': 0, draft: 0, in_progress: 0, published: 0, completed: 0, archived: 0,
  })
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [pdfImportBook, setPDFImportBook] = useState<Book | null>(null)

  async function load() {
    if (!user) return
    setLoading(true)
    try {
      setData(await api<PageResult<Book>>('/books', { params: { scope, page, page_size: 9, status, title: keyword, sort } }))
      const summary = await api<Record<string, number>>('/books/status-counts', { params: { scope } }).catch(() => null)
      if (summary) setCounts(summary)
    } catch (e) {
      showToast({ title: '书籍加载失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (user && router.isReady) load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [user, router.isReady, page, scope, status, keyword, sort])

  function changeScope(next: 'owned' | 'collaborating') {
    setStatus('')
    setPage(1)
    setMenuFor(null)
    router.replace({ pathname: '/books', query: next === 'collaborating' ? { scope: next } : {} }, undefined, { shallow: true })
  }

  // 客户端排序（API 分页内排序字段当前仅支持基础列；数量小时在当前页排序即可）
  const items = [...(data.items || [])].sort((a, b) => {
    if (sort === 'views') return b.view_count - a.view_count
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN')
    if (sort === 'created') return a.created_at < b.created_at ? 1 : -1
    return a.updated_at < b.updated_at ? 1 : -1
  })

  async function remove(book: Book) {
    if (!await confirmAction({
      title: '移入回收站',
      message: `确定将「${book.title}」及其全部章节移入回收站吗？可在 30 天内恢复。`,
      confirmLabel: '移入回收站',
      danger: true,
    })) return
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      showToast({ title: '删除失败', message: (e as Error).message, tone: 'error' })
    }
  }

  async function copyLink(book: Book) {
    const url = `${window.location.origin}/book/detail/${encodeURIComponent(book.slug)}`
    try {
      await navigator.clipboard.writeText(url)
      showToast({ message: '访问链接已复制', tone: 'success' })
    } catch {
      await requestInput({ title: '复制访问链接', label: '访问链接', defaultValue: url, confirmLabel: '关闭' })
    }
    setMenuFor(null)
  }

  async function leaveCollaboration(book: Book) {
    if (!user || !await confirmAction({
      title: '退出书籍协作',
      message: `确定退出《${book.title}》的协作吗？退出后将无法继续访问这本私有书籍。`,
      confirmLabel: '确认退出',
      danger: true,
    })) return
    try {
      await api(`/books/${book.id}/collaborators/${user.id}`, { method: 'DELETE' })
      showToast({ message: '已退出书籍协作', tone: 'success' })
      await load()
    } catch (e) {
      showToast({ title: '退出失败', message: (e as Error).message, tone: 'error' })
    }
  }

  if (!user) return <Loading className="min-h-[60vh]" label="正在验证登录状态…" />

  const hasBooks = (data.items || []).length > 0

  return (
    <>
      <Seo siteName={siteName} title="我的书籍" noindex />
      <Container>
      {/* 页头 */}
      <div className="pb-8 pt-2">
        <p className="text-sm text-slate-400">个人知识库</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink md:text-4xl">我的书籍</h1>
            <p className="mt-2 text-[15px] text-slate-500">在这里继续写作、整理章节，或者发布你的下一本知识作品。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/user/trash" variant="ghost" className="px-4 text-base">
              <i className="fa-regular fa-trash-can" aria-hidden="true" /> 回收站
            </ButtonLink>
            <Button variant="outline" className="px-5 text-base" onClick={() => setImportOpen(true)}>
              <UploadIcon className="h-5 w-5" /> 导入书籍
            </Button>
            <ButtonLink href="/books/create" className="px-5 text-base">
              <PlusIcon className="h-5 w-5" /> 新建书籍
            </ButtonLink>
          </div>
        </div>
      </div>

      <SegmentedTabs className="mb-5" value={scope} ariaLabel="书籍范围"
        onChange={(value) => changeScope(value as 'owned' | 'collaborating')} items={[
          { value: 'owned', label: '我创建的' },
          { value: 'collaborating', label: '与我协作的' },
        ]} />

      {/* 筛选行 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-200 py-3">
        <SegmentedTabs value={status} ariaLabel="书籍状态" onChange={(value) => { setStatus(value); setPage(1) }}
          items={statusTabs.map((tab) => ({
            value: tab.key,
            label: <>{tab.label}{counts[tab.key] !== undefined && <span className="ml-1 text-xs text-slate-400">{counts[tab.key]}</span>}</>,
          }))} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
              placeholder="搜索我的书籍"
              className="h-10 w-56 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-primary-500 focus:outline-none" />
          </div>
          <Select className="w-36" value={sort} onChange={(v) => { setSort(v as SortKey); setPage(1) }} options={sortOptions} />
          <SegmentedTabs iconOnly value={view} ariaLabel="书籍展示方式"
            onChange={(value) => setView(value as 'grid' | 'list')} items={[
              { value: 'grid', label: '网格视图', icon: <GridIcon className="h-4 w-4" /> },
              { value: 'list', label: '列表视图', icon: <ListIcon className="h-4 w-4" /> },
            ]} />
        </div>
      </div>

      <p className="py-4 text-sm text-slate-400">共 {data.total} 本书籍</p>

      {loading ? (
        <Loading />
      ) : hasBooks ? (
        <div className={view === 'grid' ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
          {items.map((book) => (
            <BookCardMine key={book.id} book={book} view={view} collaborating={scope === 'collaborating'}
              menuOpen={menuFor === book.id} setMenuOpen={(open) => setMenuFor(open ? book.id : null)}
              onCopy={() => copyLink(book)} onImportPDF={() => setPDFImportBook(book)} onDelete={() => remove(book)}
              onLeave={() => leaveCollaboration(book)} />
          ))}
        </div>
      ) : (
        <EmptyState>
          {scope === 'owned' ? <>
            还没有书籍，<Link href="/books/create" className="text-primary-600 hover:underline">创建第一本</Link>
          </> : '还没有已接受的书籍协作，新的邀请会显示在通知中心'}
        </EmptyState>
      )}

      <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />

      {importOpen && <BookImportDialog onClose={() => setImportOpen(false)} onImported={load} />}
      {pdfImportBook && (
        <PDFImportDialog book={pdfImportBook} onClose={() => setPDFImportBook(null)} onImported={load} />
      )}

    </Container>
  </>
  )
}

type ImportKind = 'zip' | 'pdf' | 'web'
type WebRenderMode = 'auto' | 'static' | 'browser'
type ImportResult = { book: Book; message?: string; imported_doc?: number; render_mode?: string }

function BookImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => Promise<void> }) {
  const [kind, setKind] = useState<ImportKind>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [url, setURL] = useState('')
  const [renderMode, setRenderMode] = useState<WebRenderMode>('auto')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  function switchKind(next: ImportKind) {
    if (submitting) return
    setKind(next)
    setFile(null)
    setError('')
    setResult(null)
  }

  async function uploadFile(endpoint: string, selectedFile: File): Promise<ImportResult> {
    const form = new FormData()
    form.append('file', selectedFile)
    if (title.trim()) form.append('title', title.trim())
    const token = getToken()
    const response = await fetch(`${API_BASE}/api/v1${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.success === false) throw new Error(payload.message || `导入失败 (${response.status})`)
    return payload.data as ImportResult
  }

  async function submit() {
    if (kind !== 'web' && !file) {
      setError(`请选择要导入的 ${kind === 'pdf' ? 'PDF' : 'ZIP'} 文件`)
      return
    }
    if (kind === 'web' && !url.trim()) {
      setError('请输入要导入的网页地址')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const imported = kind === 'web'
        ? await api<ImportResult>('/import/web', { method: 'POST', body: { url: url.trim(), title: title.trim(), render_mode: renderMode } })
        : await uploadFile(kind === 'pdf' ? '/import/pdf' : '/import', file as File)
      setResult(imported)
      await onImported()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const loadingLabel = kind === 'pdf'
    ? '正在解析 PDF 并构建章节…'
    : kind === 'web'
      ? renderMode === 'static' ? '正在抓取并解析网页…' : '正在抓取网页，必要时会启动浏览器渲染…'
      : '正在导入书籍压缩包…'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-label="导入书籍" onMouseDown={(event) => { if (!submitting && event.target === event.currentTarget) onClose() }}>
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 sm:px-7">
          <div>
            <h2 className="text-xl font-bold text-ink">导入并构建书籍</h2>
            <p className="mt-1 text-sm text-slate-500">导入结果会保存为仅自己可见的草稿，确认内容后再发布。</p>
          </div>
          <button type="button" aria-label="关闭" disabled={submitting} onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-6 sm:px-7">
          <SegmentedTabs fullWidth value={kind} ariaLabel="导入内容类型"
            onChange={(value) => switchKind(value as ImportKind)} items={[
              { value: 'pdf', label: 'PDF 文档', icon: <FileTextIcon className="h-4 w-4" /> },
              { value: 'web', label: '网页内容', icon: <GlobeIcon className="h-4 w-4" /> },
              { value: 'zip', label: '书籍压缩包', icon: <UploadIcon className="h-4 w-4" /> },
            ]} />

          {result ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckIcon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">书籍已构建完成</h3>
              <p className="mt-2 text-sm text-slate-500">{result.message || `《${result.book.title}》已保存为草稿`}</p>
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="outline" onClick={onClose}>完成</Button>
                <ButtonLink href={`/book/writer/${encodeURIComponent(result.book.slug)}`}>进入编辑</ButtonLink>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {kind === 'web' ? (
                <>
                  <Field label="网页地址">
                    <Input type="url" value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://example.com/article"
                      leading={<GlobeIcon className="h-4 w-4" />} />
                  </Field>
                  <fieldset>
                    <legend className="text-sm font-medium text-slate-700">解析方式</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {([
                        ['auto', '自动识别', '优先快速抓取，检测到单页应用后自动渲染'],
                        ['static', '静态抓取', '适合服务端直接输出正文的网页'],
                        ['browser', '浏览器渲染', '适合必须运行 JavaScript 才显示正文的网页'],
                      ] as const).map(([value, label, help]) => (
                        <label key={value} className={`cursor-pointer rounded-xl border p-3 transition-colors ${renderMode === value ? 'border-primary-400 bg-primary-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input className="sr-only" type="radio" name="render-mode" value={value} checked={renderMode === value} onChange={() => setRenderMode(value)} />
                          <span className="block text-sm font-medium text-slate-800">{label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{help}</span>
                        </label>
                      ))}
                    </div>
                    {renderMode !== 'static' && <p className="mt-2 text-xs leading-5 text-slate-400">服务器首次处理动态网页时可能需要准备 Chromium 运行环境，耗时会比后续导入更长。</p>}
                  </fieldset>
                </>
              ) : (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">选择文件</span>
                  <span className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-6 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40">
                    <UploadIcon className="h-7 w-7 text-primary-500" />
                    <span className="mt-3 text-sm font-medium text-slate-700">{file ? file.name : `点击选择 ${kind === 'pdf' ? 'PDF 文档' : 'ZIP 压缩包'}`}</span>
                    <span className="mt-1 text-xs text-slate-400">{kind === 'pdf' ? '最大 64MB；自动重建标题、段落与列表，扫描版需预先 OCR' : '用于恢复从 InfoSphere 导出的完整书籍'}</span>
                    <input type="file" accept={kind === 'pdf' ? '.pdf,application/pdf' : '.zip,application/zip'} className="sr-only"
                      onChange={(event) => { setFile(event.target.files?.[0] || null); setError('') }} />
                  </span>
                </label>
              )}

              <Field label={<>书籍名称 <span className="font-normal text-slate-400">（可选）</span></>}>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'web' ? '留空则使用网页标题' : '留空则使用文件名称'} />
              </Field>

              {error && <div role="alert" className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-600 [overflow-wrap:anywhere]">{error}</div>}
              {submitting && <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-4"><Loading className="py-1" label={loadingLabel} /></div>}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                <Button variant="outline" disabled={submitting} onClick={onClose}>取消</Button>
                <Button loading={submitting} onClick={submit}>开始导入</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 单本书卡片（网格 / 列表两种视图） ── */

function BookCardMine({ book, view, collaborating, menuOpen, setMenuOpen, onCopy, onImportPDF, onDelete, onLeave }: {
  book: Book
  view: 'grid' | 'list'
  collaborating: boolean
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  onCopy: () => void
  onImportPDF: () => void
  onDelete: () => void
  onLeave: () => void
}) {
  const detailUrl = `/book/detail/${encodeURIComponent(book.slug)}`

  // 章节计数与相对更新时间作为自定义元信息槽（含浏览量由统一卡片接管）
  const metaSlot = (
    <>
      <span className="flex items-center gap-1"><FileTextIcon className="h-3.5 w-3.5" /> {book.chapter_count ?? 0} 个章节</span>
      <span className="flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> {relativeUpdated(book.updated_at)}</span>
    </>
  )

  const menu = (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <Link role="menuitem" href={detailUrl} onClick={() => setMenuOpen(false)}
        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
        <EyeIcon className="h-4 w-4 text-slate-400" /> 查看详情
      </Link>
      {!collaborating && <>
        <Link role="menuitem" href={`/book/settings/${encodeURIComponent(book.slug)}`} onClick={() => setMenuOpen(false)}
          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
          <GearIcon className="h-4 w-4 text-slate-400" /> 书籍设置
        </Link>
        <button role="menuitem" onClick={() => { setMenuOpen(false); onImportPDF() }}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
          <i className="fa-solid fa-file-pdf w-4 text-center text-slate-400" aria-hidden="true" /> 导入 PDF
        </button>
      </>}
      <button role="menuitem" onClick={onCopy}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
        <LinkIcon2 className="h-4 w-4 text-slate-400" /> 复制访问链接
      </button>
      <div className="my-1 border-t border-slate-100" />
      <button role="menuitem" onClick={() => { setMenuOpen(false); collaborating ? onLeave() : onDelete() }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50">
        {collaborating ? <i className="fa-solid fa-arrow-right-from-bracket w-4 text-center" aria-hidden="true" /> : <TrashIcon className="h-4 w-4" />}
        {collaborating ? '退出协作' : '移入回收站'}
      </button>
    </DropdownMenu>
  )

  // 写作操作行：继续/开始写作 + 章节列表 + 书籍设置。
  // grid 走底部 actions 槽（统一卡片自带分隔线）；list 走右侧栏（含 menu）。
  const actions = view === 'grid'
    ? <ActionRow book={book} menu={null} canManage={!collaborating} canEdit={!collaborating || book.collaborator_role === 'editor'} />
    : <ActionRow book={book} menu={menu} canManage={!collaborating} canEdit={!collaborating || book.collaborator_role === 'editor'} />

  return (
    <BookCard
      book={book}
      view={view}
      showAuthor={collaborating}
      showStatus
      showVisibility={!collaborating}
      badge={collaborating ? <>
        <Badge tone="slate">协作可见</Badge>
        <Badge tone={book.collaborator_role === 'editor' ? 'emerald' : 'sky'}>{book.collaborator_role === 'editor' ? '编辑者' : '访问者'}</Badge>
      </> : undefined}
      tagsMax={3}
      tagsLink={false}
      meta={metaSlot}
      topActions={view === 'grid' ? menu : undefined}
      actions={actions}
    />
  )
}

function PDFImportDialog({ book, onClose, onImported }: { book: Book; onClose: () => void; onImported: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-labelledby="pdf-import-dialog-title"
      onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
      <section className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <i className="fa-solid fa-file-pdf" aria-hidden="true" />
              </span>
              <h2 id="pdf-import-dialog-title" className="truncate text-xl font-bold text-ink">导入 PDF 到《{book.title}》</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">解析 PDF 为 Markdown 章节，可追加到目录末尾或覆盖现有章节。</p>
          </div>
          <button type="button" aria-label="关闭 PDF 导入" disabled={busy} onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto">
          <PDFReimportPanel bookId={book.id} embedded onImported={onImported} onBusyChange={setBusy} />
        </div>
      </section>
    </div>
  )
}

function ActionRow({ book, menu, canManage, canEdit }: { book: Book; menu: React.ReactNode; canManage: boolean; canEdit: boolean }) {
  const isNew = !book.description
  const [chaptersOpen, setChaptersOpen] = useState(false)
  return (
    <div className="flex items-center justify-between">
      <Link href={canEdit ? `/book/writer/${encodeURIComponent(book.slug)}` : `/book/detail/${encodeURIComponent(book.slug)}`} className="text-sm font-medium text-primary-600 hover:underline">
        {canEdit ? (isNew ? '开始写作' : '继续写作') : '查看书籍'}
      </Link>
      <div className="relative flex items-center gap-1">
        <Tooltip content="章节列表"><button type="button" onClick={() => setChaptersOpen(!chaptersOpen)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${chaptersOpen ? 'bg-primary-50 text-primary-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
            <FileTextIcon className="h-4 w-4" />
          </button></Tooltip>
        {canManage && <Tooltip content="书籍设置"><Link href={`/book/settings/${encodeURIComponent(book.slug)}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <GearIcon className="h-4 w-4" />
          </Link></Tooltip>}
        {menu}
        {chaptersOpen && <ChapterPanel book={book} canEdit={canEdit} onClose={() => setChaptersOpen(false)} />}
      </div>
    </div>
  )
}

// ChapterPanel 书籍章节弹出列表：懒加载文档树，点击进阅读，铅笔进编辑
function ChapterPanel({ book, canEdit, onClose }: { book: Book; canEdit: boolean; onClose: () => void }) {
  const [docs, setDocs] = useState<Document[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<Document[]>(`/books/${book.id}/documents`)
      .then((d) => setDocs(d || []))
      .catch((e) => setError((e as Error).message))
  }, [book.id])

  const rows = flattenDocs(docs || [])
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute bottom-10 right-0 z-40 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">章节列表</span>
          <span className="text-xs text-slate-400">{docs ? `${rows.length} 个` : ''}</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {error && <p className="px-4 py-3 text-sm text-rose-500">{error}</p>}
          {!error && docs === null && <Loading className="py-6" label="正在加载章节…" />}
          {docs !== null && rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">暂无章节</p>}
          {rows.map((row) => (
            <div key={row.doc.id} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50">
              <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${row.doc.slug}`}
                onClick={onClose}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-700 hover:text-primary-600"
                style={{ paddingLeft: row.level * 12 }}>
                <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{book.chapter_prefix}{row.doc.title}</span>
              </Link>
              {canEdit && <Link href={`/book/writer/${encodeURIComponent(book.slug)}/${row.doc.slug}`} onClick={onClose}
                className="shrink-0 text-slate-300 transition-colors hover:text-primary-600">
                <PencilIcon className="h-3.5 w-3.5" />
              </Link>}
            </div>
          ))}
        </div>
        {canEdit && <div className="border-t border-slate-100 px-4 py-2">
          <Link href={`/book/writer/${encodeURIComponent(book.slug)}`} onClick={onClose}
            className="text-sm font-medium text-primary-600 hover:underline">在编辑器中管理全部章节</Link>
        </div>}
      </div>
    </>
  )
}

function flattenDocs(docs: Document[], level = 0): { doc: Document; level: number }[] {
  return docs.flatMap((d) => [{ doc: d, level }, ...flattenDocs(d.children || [], level + 1)])
}

function LinkIcon2({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
