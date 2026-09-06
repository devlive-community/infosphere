import { useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { serverApi, getSiteConfig, siteUrlFrom, authHeaderFrom, excerptFrom, isInstalled, getSSRUser } from '@/lib/server-api'
import { renderMarkdown, extractHeadings } from '@/lib/markdown'
import { API_BASE, formatDate } from '@/lib/api'
import Seo from '@/components/Seo'
import UserAvatar from '@/components/UserAvatar'
import { ButtonLink } from '@/components/ui'
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, FolderIcon, PencilIcon } from '@/components/icons'
import { saveReadingProgress } from '@/lib/reading-progress'
import type { Book, Document, User } from '@/lib/types'

interface ReaderProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  book: Book
  doc: Document
  html: string
  tree: Document[]
}

const FONT_SIZES = [15, 16, 18, 20, 22]

// AuthorAvatars 创作者头像列表：hover 提示用户名，点击跳转用户主页
function AuthorAvatars({ users }: { users: { username: string; avatar?: string }[] }) {
  if (users.length === 0) return null
  return (
    <span className="flex items-center gap-1">
      {users.map((u) => (
        <UserAvatar key={u.username} user={u} size="h-6 w-6" className="ring-1 ring-white transition-transform hover:scale-110" />
      ))}
    </span>
  )
}

function flatten(docs: Document[] | null | undefined): Document[] {
  return (docs || []).flatMap((d) => [d, ...flatten(d.children)])
}

export const getServerSideProps: GetServerSideProps<ReaderProps> = async ({ req, params }) => {
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const docSlug = typeof params?.doc === 'string' ? params.doc : ''
  if (!slug) return { notFound: true }
  const user = await getSSRUser(req)
  const auth = authHeaderFrom(req)
  const [site] = await Promise.all([getSiteConfig()])

  try {
    const book = await serverApi<Book>(`/books/slug/${encodeURIComponent(slug)}`, { headers: auth })
    const [tree, doc] = await Promise.all([
      serverApi<Document[]>(`/books/${book.id}/documents`, { headers: auth }).catch(() => []),
      docSlug
        ? serverApi<Document>(`/books/${book.id}/documents/slug/${encodeURIComponent(docSlug)}`, { headers: auth })
        : Promise.resolve(null),
    ])
    if (!doc) return { notFound: true }
    return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), book, doc, html: renderMarkdown(doc.content), tree, needsAuth: false } }
  } catch (e) {
    // 404/403 一律按不存在处理：不向未授权访客泄露私有章节的存在
    return { notFound: true }
  }
}

export default function Reader({ site, siteUrl, user, book, doc, html, tree }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const chapterPrefix = book?.chapter_prefix || ''

  const [fontIdx, setFontIdx] = useState(1)
  const [focus, setFocus] = useState(false)
  const [activeHeading, setActiveHeading] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const didInit = useRef(false)

  const flat = useMemo(() => flatten(tree), [tree])
  const headings = useMemo(() => extractHeadings(doc?.content), [doc])

  // 默认展开所有含子章节的节点
  useEffect(() => {
    if (didInit.current || flat.length === 0) return
    didInit.current = true
    const ids = new Set<number>()
    const walk = (docs: Document[]) => docs.forEach((d) => { if (d.children?.length) { ids.add(d.id); walk(d.children) } })
    walk(tree)
    setExpanded(ids)
  }, [tree, flat.length])

  // 记录阅读进度（登录用户按用户名隔离）
  useEffect(() => {
    if (user && book && doc) {
      saveReadingProgress(user.username, book.id, { docId: doc.id, docSlug: doc.slug, docTitle: doc.title, chapterPrefix: book.chapter_prefix || '' } as any)
    }
  }, [user, book, doc])

  // 本章目录：滚动高亮
  useEffect(() => {
    if (!headings.length) return
    setActiveHeading(headings[0].id)
    const els = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => !!el)
    if (!els.length) return
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActiveHeading((visible[0].target as HTMLElement).id)
    }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 })
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [headings, doc?.id])

  if (!book || !doc) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm" style={{ marginTop: '4rem' }}>
        该章节仅对作者可见，请<Link href="/login" className="mx-1 text-primary-600">登录</Link>后查看。
      </div>
    )
  }

  const canEdit = !!user && !!book && (user.id === book.user_id || user.role === 'admin')

  const index = doc ? flat.findIndex((d) => d.id === doc.id) : -1
  const prev = index > 0 ? flat[index - 1] : null
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null
  const readingMin = doc ? Math.max(1, Math.round((doc.content || '').replace(/\s/g, '').length / 400)) : 0
  const parentDoc = doc?.parent_id ? flat.find((d) => d.id === doc.parent_id) : null
  const author = book.user
  const authorAvatar = author?.avatar ? (/^https?:\/\//.test(author.avatar) ? author.avatar : API_BASE + author.avatar) : ''
  const cover = book.cover_image ? (/^https?:\/\//.test(book.cover_image) ? book.cover_image : API_BASE + book.cover_image) : ''

  const docUrl = doc ? `${siteUrl}/book/reader?slug=${encodeURIComponent(book.slug)}&doc=${encodeURIComponent(doc.slug)}` : siteUrl
  const jsonLd = doc ? [
    { '@context': 'https://schema.org', '@type': 'Chapter', name: `${chapterPrefix}${doc.title}`, url: docUrl, datePublished: doc.created_at, dateModified: doc.updated_at, isPartOf: { '@type': 'Book', name: book.title }, author: { '@type': 'Person', name: author?.username || '佚名' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
      { '@type': 'ListItem', position: 2, name: book.title, item: `${siteUrl}/book/detail?slug=${encodeURIComponent(book.slug)}` },
      { '@type': 'ListItem', position: 3, name: doc.title, item: docUrl },
    ] },
  ] : undefined

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setActiveHeading(id)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <Seo
        siteName={siteName}
        title={doc ? `${chapterPrefix}${doc.title} · ${book.title}` : book.title}
        description={doc ? excerptFrom(doc.content || book.description, 160) : book.description}
        url={docUrl}
        image={book.cover_image || undefined}
        jsonLd={jsonLd}
      />
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-slate-900">
            <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
            {siteName}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="max-w-[220px] truncate font-medium text-slate-900">{book.title}</span>
          <span className="text-slate-300">/</span>
          <Link href={`/book/detail/${encodeURIComponent(book.slug)}`}
            className="flex shrink-0 items-center gap-1 text-slate-500 hover:text-primary-600">
            <ChevronRightIcon className="h-4 w-4 rotate-180" /> 返回书籍
          </Link>
        </div>
        <div className="hidden min-w-0 truncate text-sm font-medium text-slate-900 md:block">
          {doc ? `${chapterPrefix}${doc.title}` : book.title}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 items-stretch">
        {/* 左：书籍信息 + 目录 */}
        {!focus && (
          <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 pt-5 lg:flex">
            <div className="shrink-0 px-4">
            <div className="mb-3 flex flex-col text-left">
              <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-primary-200 to-[#8B8DFF]">
                {cover && <img src={cover} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(book.tags || []).map((t) => (
                  <span key={t.id} className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">{t.name}</span>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <UserAvatar user={author} size="h-5 w-5" />
                  {author?.username || '佚名'}
                </span>
                <span className="text-xs text-slate-400">{flat.length} 个章节</span>
              </div>
              {canEdit && (
                <ButtonLink href={`/book/writer/${encodeURIComponent(book.slug)}/${doc ? encodeURIComponent(doc.slug) : ''}`}
                  className="mt-3 w-full">
                  <PencilIcon className="h-4 w-4" /> 写作
                </ButtonLink>
              )}
            </div>
            <div className="mb-2 mt-2 text-sm font-semibold text-slate-900">目录</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="min-w-max pb-2 pl-4">
                <ReaderTree items={tree} bookSlug={book.slug} chapterPrefix={chapterPrefix} activeId={doc?.id} expanded={expanded} setExpanded={setExpanded} />
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-100 px-4 py-2 text-center text-xs text-slate-400">
              Powered by InfoSphere
            </div>
          </aside>
        )}

        {/* 中：正文（内部滚动）+ 底部固定的上一篇/下一篇 */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="px-8 py-10 lg:px-14">
              {doc ? (
                <article>
                  {parentDoc && <div className="mb-1 text-sm font-medium text-primary-600">{chapterPrefix}{parentDoc.title}</div>}
                  <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">{doc.title}</h1>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                    <UserAvatar user={author} size="h-6 w-6" />
                    <span className="text-slate-600">{author?.username || '佚名'}</span>
                    <span>· 更新于 {formatDate(doc.updated_at).slice(0, 10)}</span>
                    <span>· 阅读 {readingMin} 分钟</span>
                    {canEdit && (
                      <Link href={`/book/writer/${encodeURIComponent(book.slug)}/${encodeURIComponent(doc.slug)}`}
                        className="flex items-center gap-1 text-primary-600 transition-colors hover:text-primary-700">
                        <i className="fa-solid fa-pen-to-square text-xs" aria-hidden="true" /> 编辑
                      </Link>
                    )}
                  </div>
                  <hr className="my-6 border-slate-100" />
                  <div className="markdown-body" style={{ fontSize: FONT_SIZES[fontIdx] }} dangerouslySetInnerHTML={{ __html: html }} />
                </article>
              ) : (
                <div className="py-24 text-center text-slate-400">
                  <p>请从左侧目录选择章节开始阅读</p>
                  {flat.length === 0 && <p className="mt-2 text-xs">本书暂无已发布章节</p>}
                </div>
              )}
            </div>
          </div>

          {/* 上一篇/下一篇：固定在内容区底部（标题 + 创作者头像列表） */}
          {doc && (
            <nav className="flex shrink-0 items-start justify-between gap-3 border-t border-slate-200 bg-white px-8 py-3 lg:px-14">
              {prev ? (
                <div className="group flex min-w-0 flex-col gap-1.5 text-sm">
                  <span className="text-xs text-slate-400">上一篇</span>
                  <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${prev.slug}`}
                    className="block truncate font-medium text-slate-800 group-hover:text-primary-600">{chapterPrefix}{prev.title}</Link>
                  <AuthorAvatars users={book.user ? [book.user] : []} />
                </div>
              ) : <span className="text-xs text-slate-300">已经是第一章了</span>}
              {next ? (
                <div className="group flex min-w-0 flex-col items-end gap-1.5 text-right text-sm">
                  <span className="text-xs text-slate-400">下一篇</span>
                  <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${next.slug}`}
                    className="block truncate font-medium text-slate-800 group-hover:text-primary-600">{chapterPrefix}{next.title}</Link>
                  <AuthorAvatars users={book.user ? [book.user] : []} />
                </div>
              ) : <span className="text-xs text-slate-300">已经是最后一章了</span>}
            </nav>
          )}
        </main>

        {/* 右：本章目录（内滚）+ 阅读设置 + 作者（固定底部） */}
        {!focus && (
          <aside className="hidden w-72 shrink-0 flex-col border-l border-slate-200 px-5 py-6 xl:flex">
            {/* 本章目录：占满剩余区域，内部滚动 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {headings.length > 0 ? (
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-slate-900">本章目录</h2>
                  <ul className="space-y-1 border-l border-slate-100">
                    {headings.map((h) => (
                      <li key={h.id}>
                        <a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); jumpTo(h.id) }}
                          className={`-ml-px block border-l-2 py-1 text-sm transition-colors ${h.level === 3 ? 'pl-6' : 'pl-3'} ${
                            activeHeading === h.id ? 'border-primary-500 font-medium text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                          }`}>
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="px-1 py-2 text-xs text-slate-400">本章暂无目录</p>
              )}
            </div>

            {/* 阅读设置：固定 */}
            <div className="shrink-0 border-t border-slate-100 pt-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">阅读设置</h2>
              <div className="grid grid-cols-3 gap-2">
                <SettingButton label="减小字号" onClick={() => setFontIdx((i) => Math.max(0, i - 1))} disabled={fontIdx === 0}>
                  <span className="text-base font-semibold">A-</span>
                </SettingButton>
                <SettingButton label="增大字号" onClick={() => setFontIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))} disabled={fontIdx === FONT_SIZES.length - 1}>
                  <span className="text-lg font-semibold">A+</span>
                </SettingButton>
                <SettingButton label="专注模式" active={focus} onClick={() => setFocus((f) => !f)}>
                  <FocusIcon className="h-5 w-5" />
                </SettingButton>
              </div>
            </div>

            {/* 作者：固定在最底部 */}
            {author && (
              <div className="mt-5 shrink-0 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  {authorAvatar
                    ? <img src={authorAvatar} alt="" className="h-11 w-11 rounded-lg object-cover" />
                    : <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary-200 to-[#8B8DFF] font-semibold text-white">{(author.username || '?').slice(0, 1)}</span>}
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{author.username}</div>
                    {author.bio && <div className="line-clamp-2 text-xs text-slate-500">{author.bio}</div>}
                  </div>
                </div>
                <Link href={`/user/home?username=${encodeURIComponent(author.username)}`}
                  className="mt-3 flex h-9 w-full items-center justify-center rounded-lg border border-primary-500 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50">
                  查看作者主页
                </Link>
              </div>
            )}
          </aside>
        )}

        {/* 专注模式下的退出按钮 */}
        {focus && (
          <button onClick={() => setFocus(false)}
            className="fixed right-6 top-20 z-20 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:text-primary-600">
            <FocusIcon className="h-4 w-4" /> 退出专注
          </button>
        )}
      </div>
    </div>
  )
}

/* ── 子组件 ── */

function SettingButton({ children, label, onClick, active, disabled }: { children: ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
      }`}>
      {children}
      <span className="text-[11px] text-slate-400">{label}</span>
    </button>
  )
}

interface ReaderTreeProps {
  items: Document[]
  bookSlug: string
  chapterPrefix: string
  activeId?: number
  expanded: Set<number>
  setExpanded: (s: Set<number>) => void
  depth?: number
}

function ReaderTree({ items, bookSlug, chapterPrefix, activeId, expanded, setExpanded, depth = 0 }: ReaderTreeProps) {
  return (
    <ul className={depth === 0 ? 'min-w-max space-y-0.5' : 'ml-4 min-w-max space-y-0.5 border-l border-slate-100 pl-1'}>
      {items.map((item) => {
        const hasChildren = !!item.children?.length
        const isExpanded = expanded.has(item.id)
        const active = activeId === item.id
        return (
          <li key={item.id}>
            <div className={`group relative flex items-center rounded-lg text-sm ${active ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
              {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-full bg-primary-500" />}
              {hasChildren ? (
                <button type="button" aria-label={isExpanded ? '折叠' : '展开'}
                  onClick={() => { const n = new Set(expanded); n.has(item.id) ? n.delete(item.id) : n.add(item.id); setExpanded(n) }}
                  className="ml-1 flex h-6 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600">
                  {isExpanded ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                </button>
              ) : <span className="ml-1 w-5 shrink-0" />}
              <Link href={`/book/reader?slug=${encodeURIComponent(bookSlug)}&doc=${item.slug}`}
                className="flex flex-1 items-center gap-1.5 py-1.5 pl-1 pr-2 text-left">
                {hasChildren
                  ? <FolderIcon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-500' : 'text-slate-400'}`} />
                  : <FileTextIcon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-500' : 'text-slate-400'}`} />}
                <span className={`whitespace-nowrap ${active ? 'font-medium text-primary-700' : 'text-slate-700'}`}>{chapterPrefix}{item.title}</span>
              </Link>
            </div>
            {hasChildren && isExpanded && (
              <ReaderTree items={item.children!} bookSlug={bookSlug} chapterPrefix={chapterPrefix} activeId={activeId} expanded={expanded} setExpanded={setExpanded} depth={depth + 1} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function FocusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    </svg>
  )
}
