import Link from 'next/link'
import Container from '@/components/Container'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { serverApi, getSiteConfig, siteUrlFrom, authHeaderFrom, excerptFrom, isInstalled, getSSRUser } from '@/lib/server-api'
import { API_BASE, formatNumber } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import { useApp } from '@/lib/auth'
import { api } from '@/lib/api'
import { getReadingProgress } from '@/lib/reading-progress'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, ButtonLink, Tooltip, Loading, useFeedback } from '@/components/ui'
import UserAvatar from '@/components/UserAvatar'
import TagChips from '@/components/TagChips'
import BookCard from '@/components/BookCard'
import Seo from '@/components/Seo'
import {
  BookIcon, CalendarIcon, CheckCircleSmallIcon, ChevronRightIcon, EyeIcon,
  GlobeIcon, HeartIcon, HelpCircleIcon, LinkIcon, ShareIcon, BookmarkIcon, ClockIcon, GearIcon,
} from '@/components/icons'
import type { Book, BookAccess, Document, User } from '@/lib/types'

interface BookDetailProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  book: Book
  tree: Document[]
  /** true 表示 SSR 阶段无法公开访问（草稿/私有），交给客户端携带令牌重试 */
  needsAuth: boolean
  related: Book[]
  access: BookAccess | null
}

interface BookData {
  book: Book | null
  tree: Document[]
  status: number
}

async function fetchBook(slug: string, auth: Record<string, string>): Promise<BookData> {
  try {
    const book = await serverApi<Book>(`/books/slug/${encodeURIComponent(slug)}`, { headers: auth })
    const tree = await serverApi<Document[]>(`/books/${book.id}/documents`, { headers: auth }).catch(() => [])
    return { book, tree, status: 200 }
  } catch (e) {
    return { book: null, tree: [], status: (e as { status?: number }).status ?? 500 }
  }
}

export const getServerSideProps: GetServerSideProps<BookDetailProps> = async ({ req, params }) => {
  // 未安装时强制进入安装向导（服务端重定向，不渲染任何内容）
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }

  const slug = typeof params?.slug === 'string' ? params.slug : ''
  if (!slug) return { notFound: true }
  const user = await getSSRUser(req)

  const auth = authHeaderFrom(req)
  const [site, first] = await Promise.all([getSiteConfig(), fetchBook(slug, auth)])

  // 公开访问失败且用户带了令牌（草稿/私有书），交给客户端重试
  if (!first.book) {
    if (auth.Authorization) {
      return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), book: null as unknown as Book, tree: [], needsAuth: true, related: [], access: null } }
    }
    return { notFound: true }
  }

  // 你可能也喜欢：同标签的其它公开书籍
  const tagSlug = first.book.tags?.[0]?.slug
  const related = tagSlug
    ? await serverApi<Book[]>(`/tags/${encodeURIComponent(tagSlug)}/books`, { params: { page_size: 6 } })
        .then((d) => (d as unknown as { items?: Book[] }).items || []).catch(() => [] as Book[])
    : []

  const access = user
    ? await serverApi<BookAccess>(`/books/slug/${encodeURIComponent(slug)}/access`, { headers: auth }).catch(() => null)
    : null

  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), book: first.book, tree: first.tree, needsAuth: false, related: related.filter((b) => b.id !== first.book!.id).slice(0, 3), access } }
}

// —— 计算辅助 ——

function countChapters(docs: Document[]): { chapters: number; sections: number } {
  let chapters = 0
  let sections = 0
  for (const d of docs) {
    if (d.children?.length) { chapters += 1; sections += d.children.length }
    else if (d.parent_id === null) chapters += 1
  }
  return { chapters, sections }
}

export default function BookDetail({ site, siteUrl, book: ssrBook, tree: ssrTree, related, needsAuth, access }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { requestInput, showToast } = useFeedback()
  const { user, authReady } = useApp()
  const router = useRouter()
  const slug = typeof router.query.slug === 'string' ? router.query.slug : ''
  // 私有/草稿书 SSR 无令牌取不到，挂载后携带本地令牌客户端重试（避免默认空白）
  const [book, setBook] = useState<Book | null>(ssrBook ?? null)
  const [tree, setTree] = useState<Document[]>(ssrTree || [])
  const [fetching, setFetching] = useState<boolean>(!!needsAuth && !ssrBook)
  useEffect(() => {
    if (!needsAuth || ssrBook || !slug) return
    let cancelled = false
    ;(async () => {
      try {
        const b = await api<Book>(`/books/slug/${encodeURIComponent(slug)}`)
        const t = await api<Document[]>(`/books/${b.id}/documents`).catch(() => [] as Document[])
        if (!cancelled) { setBook(b); setTree(t) }
      } catch { /* 无权限：保持 null，交给 ClientFallback 提示 */ }
      finally { if (!cancelled) setFetching(false) }
    })()
    return () => { cancelled = true }
  }, [needsAuth, ssrBook, slug])
  // 阅读进度仅存在于本地，客户端挂载后读取（避免水合不一致）
  const [progress, setProgress] = useState<{ docSlug: string; docTitle: string; chapterPrefix?: string } | null>(null)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState<number | null>(null)
  const [favorited, setFavorited] = useState(false)
  const [favoriteCount, setFavoriteCount] = useState<number | null>(null)
  const [reactionsReady, setReactionsReady] = useState(false)
  const [reactionError, setReactionError] = useState('')
  const [reactBusy, setReactBusy] = useState<'like' | 'favorite' | null>(null)
  const bookSlugSafe = book?.slug || ''
  const username = user?.username || ''
  useEffect(() => {
    if (username && book) {
      getReadingProgress(username, book.id).then(setProgress)
    }
  }, [username, book])

  useEffect(() => {
    if (!authReady || !book) {
      setReactionsReady(false)
      return
    }
    if (!user) {
      setLiked(false)
      setLikeCount(null)
      setFavorited(false)
      setFavoriteCount(null)
      setReactionError('')
      setReactionsReady(true)
      return
    }

    let cancelled = false
    setReactionsReady(false)
    setReactionError('')
    api<{ types: string[]; like_count: number; favorite_count: number }>(`/books/${book.id}/reactions/me`)
      .then((result) => {
        if (cancelled) return
        const types = result.types || []
        setLiked(types.includes('like'))
        setLikeCount(result.like_count || 0)
        setFavorited(types.includes('favorite'))
        setFavoriteCount(result.favorite_count || 0)
      })
      .catch((error) => {
        if (cancelled) return
        setLiked(false)
        setLikeCount(null)
        setFavorited(false)
        setFavoriteCount(null)
        setReactionError((error as Error).message || '互动状态加载失败')
      })
      .finally(() => {
        if (!cancelled) setReactionsReady(true)
      })

    return () => { cancelled = true }
  }, [authReady, user, book])

  // 阅读进度：登录用户读过的章节 ID 集合，用于目录标记与整体进度
  const [readSet, setReadSet] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!user || !book) { setReadSet(new Set()); return }
    api<{ doc_ids: number[] }>(`/books/${book.id}/read-chapters`)
      .then((r) => setReadSet(new Set(r.doc_ids || [])))
      .catch(() => { /* 未登录或无进度：空集合 */ })
  }, [user?.id, book?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const siteName = site.site_name || 'InfoSphere'
  const chapterPrefix = book?.chapter_prefix || ''

  const canManage = access?.can_manage === true || (!!user && !!book && (user.id === book.user_id || user.role === 'admin'))
  const canEdit = access?.can_edit_content === true || canManage

  if (fetching) {
    return <Container><Loading className="min-h-[60vh]" label="正在加载书籍…" /></Container>
  }
  if (!book) {
    return <ClientFallback slug={slug} />
  }

  const cover = resolveMediaUrl(book.cover_image)
  const { chapters } = countChapters(tree)
  const firstDoc = flatFirst(tree)
  const readDocSlug = firstDoc?.slug || ''
  const readUrl = readDocSlug ? `/book/reader/${encodeURIComponent(book.slug)}/${readDocSlug}` : ''
  const bookUrl = `${siteUrl}/book/detail/${encodeURIComponent(book.slug)}`
  const words = flatWords(tree)
  const readingMin = Math.max(1, Math.round(words / 400))
  const author = book.user

  // 整体阅读进度：已读章节数 / 全部章节数
  const allDocIds = flatDocIds(tree)
  const totalChapters = allDocIds.length
  const readCount = allDocIds.filter((id) => readSet.has(id)).length
  const progressPct = totalChapters > 0 ? Math.round((readCount / totalChapters) * 100) : 0

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Book', name: book.title,
      description: book.description || undefined,
      author: { '@type': 'Person', name: author?.username || '佚名' },
      url: bookUrl, inLanguage: 'zh-CN',
    },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
      { '@type': 'ListItem', position: 2, name: '发现', item: `${siteUrl}/explore` },
      { '@type': 'ListItem', position: 3, name: book.title, item: bookUrl },
    ] },
  ]

  async function share() {
    try {
      await navigator.clipboard.writeText(bookUrl)
      showToast({ message: '链接已复制到剪贴板', tone: 'success' })
    } catch {
      await requestInput({ title: '分享书籍', label: '书籍链接', defaultValue: bookUrl, confirmLabel: '关闭' })
    }
  }

  async function toggleReaction(type: 'like' | 'favorite') {
    const currentBook = book
    if (!currentBook) return
    if (!user) {
      const next = router.asPath.startsWith('/') && !router.asPath.startsWith('//') ? router.asPath : `/book/detail/${encodeURIComponent(currentBook.slug)}`
      await router.push(`/login?next=${encodeURIComponent(next)}`)
      return
    }
    if (!reactionsReady || reactBusy) return

    const wasActive = type === 'like' ? liked : favorited
    const previousCount = type === 'like' ? likeCount : favoriteCount
    setReactBusy(type)
    setReactionError('')
    if (type === 'like') {
      setLiked(!wasActive)
      setLikeCount((count) => count === null ? count : Math.max(0, count + (wasActive ? -1 : 1)))
    } else {
      setFavorited(!wasActive)
      setFavoriteCount((count) => count === null ? count : Math.max(0, count + (wasActive ? -1 : 1)))
    }
    try {
      if (wasActive) {
        await api(`/books/${currentBook.id}/reactions`, { method: 'DELETE', params: { type } })
      } else {
        await api(`/books/${currentBook.id}/reactions`, { method: 'POST', body: { type } })
      }
    } catch (error) {
      if (type === 'like') {
        setLiked(wasActive)
        setLikeCount(previousCount)
      } else {
        setFavorited(wasActive)
        setFavoriteCount(previousCount)
      }
      setReactionError((error as Error).message || `${type === 'like' ? '点赞' : '收藏'}操作失败，请稍后重试`)
    } finally {
      setReactBusy(null)
    }
  }

  return (
    <div className="bg-warm">
      <Seo
        siteName={siteName}
        title={book.title}
        description={excerptFrom(book.description || `${book.title} — ${author?.username || ''} 的知识书籍`, 160)}
        url={bookUrl}
        image={book.cover_image || undefined}
        jsonLd={jsonLd}
      />

      <Container>
        {/* 面包屑 */}
        <nav className="flex items-center gap-1.5 py-3 text-sm text-slate-500">
          <Link href="/explore" className="hover:text-primary-600">发现</Link>
          {(book.tags || []).slice(0, 1).map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span className="text-slate-300">/</span>
              <Link href={`/explore?tag=${encodeURIComponent(t.slug)}`} className="hover:text-primary-600">{t.name}</Link>
            </span>
          ))}
          <span className="text-slate-300">/</span>
          <span className="truncate text-slate-900">{book.title}</span>
        </nav>
      </Container>

      {/* Hero */}
      <Container>
        <section className="grid items-start gap-x-10 gap-y-8 pb-8 lg:grid-cols-[300px_1fr_300px]">
          {/* 左：大封面 */}
          <div className="mx-auto w-64 lg:mx-0 lg:w-full">
            <div className="aspect-[3/4] w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-primary-200 to-[#8B8DFF] shadow-md">
              {cover && <img src={cover} alt={book.title} onError={(e) => { e.currentTarget.style.display = 'none' }} className="h-full w-full object-cover" />}
            </div>
          </div>

          {/* 中：标题区 + 操作 */}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight text-ink md:text-4xl">{book.title}</h1>
            {book.description && <p className="mt-3 text-[15px] leading-7 text-slate-500">{book.description}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {(book.tags || []).map((t) => (
                <span key={t.id} className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">{t.name}</span>
              ))}
            </div>

            {author && (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href={`/user/${encodeURIComponent(author.username)}`} className="flex items-center gap-3">
                  <UserAvatar user={author} size="h-11 w-11" link={false} />
                  <span>
                    <span className="block font-semibold text-slate-900">{author.username}</span>
                    {author.bio && <span className="block text-xs text-slate-400">{author.bio}</span>}
                  </span>
                </Link>
                <Link href={`/user/${encodeURIComponent(author.username)}`}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-700 transition-colors hover:border-primary-400 hover:text-primary-600">
                  查看作者主页
                </Link>
              </div>
            )}

            {/* 统计条 */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><BookIcon className="h-4 w-4" /> {chapters} 个章节</span>
              <span className="flex items-center gap-1.5"><ClockIcon className="h-4 w-4" /> 约 {readingMin} 分钟</span>
              <span className="flex items-center gap-1.5"><EyeIcon className="h-4 w-4" /> {formatNumber(book.view_count)} 次阅读</span>
              <span className="flex items-center gap-1.5"><CalendarIcon className="h-4 w-4" /> 更新于 {fmtDate(book.updated_at)}</span>
            </div>

            {/* 操作 */}
            {/* 上次阅读（有进度且不是第一章时显示） */}
            {progress && progress.docSlug !== readDocSlug && readDocSlug && (
              <p className="mt-5 text-sm text-slate-500">
                上次阅读：{progress.chapterPrefix}{progress.docTitle}
                <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${progress.docSlug}`}
                  className="ml-3 font-medium text-primary-600 hover:underline">继续阅读</Link>
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {readUrl ? (
                <ButtonLink href={progress && progress.docSlug !== readDocSlug ? `/book/reader/${encodeURIComponent(book.slug)}/${progress.docSlug}` : readUrl} className="h-11 px-7 text-base">
                  <BookIcon className="h-5 w-5" /> {progress && progress.docSlug !== readDocSlug ? '继续阅读' : '开始阅读'}
                </ButtonLink>
              ) : (
                <span className="text-sm text-slate-400">暂无已发布章节</span>
              )}
              <Button type="button" variant="outline" onClick={() => toggleReaction('like')}
                disabled={!authReady || (!!user && !reactionsReady) || reactBusy !== null}
                aria-pressed={liked}
                className={`h-11 px-5 ${liked
                  ? 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}>
                <HeartIcon className="h-4 w-4" />
                {!authReady || (!!user && !reactionsReady) || reactBusy === 'like'
                  ? '处理中…'
                  : `${liked ? '已点赞' : '点赞'}${likeCount !== null ? ` ${formatNumber(likeCount)}` : ''}`}
              </Button>
              <Button type="button" variant="outline" onClick={() => toggleReaction('favorite')}
                disabled={!authReady || (!!user && !reactionsReady) || reactBusy !== null}
                aria-pressed={favorited}
                className={`h-11 px-5 ${favorited
                  ? 'border-primary-200 bg-primary-50 text-primary-700 hover:border-primary-300 hover:bg-primary-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}>
                <BookmarkIcon className="h-4 w-4" />
                {!authReady || (!!user && !reactionsReady) || reactBusy === 'favorite'
                  ? '处理中…'
                  : `${favorited ? '已收藏' : '收藏'}${favoriteCount !== null ? ` ${formatNumber(favoriteCount)}` : ''}`}
              </Button>
              <Tooltip content="分享"><button type="button" onClick={share}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700">
                  <ShareIcon className="h-4 w-4" />
                </button></Tooltip>
              {(canManage || canEdit) && (
                <>
                  {canEdit && <ButtonLink href={`/book/writer/${encodeURIComponent(book.slug)}`} variant="outline" className="h-11">写作</ButtonLink>}
                  {canManage && (
                    <ButtonLink href={`/book/settings/${encodeURIComponent(book.slug)}`} variant="outline" className="h-11">
                      <GearIcon className="h-4 w-4" /> 设置
                    </ButtonLink>
                  )}
                </>
              )}
            </div>
            {reactionError && <p role="alert" className="mt-2 text-sm text-rose-600">{reactionError}</p>}
          </div>

          {/* 右：书籍信息卡 */}
          <aside className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-900">书籍信息</h2>
              <dl className="space-y-3 text-sm">
                <InfoRow icon={<CheckCircleSmallIcon className="h-4 w-4" />} label="状态" value={statusName(book.status)} />
                <InfoRow icon={<GlobeIcon className="h-4 w-4" />} label="可见性" value={book.is_public ? '公开' : '私密'} />
                <InfoRow icon={<CalendarIcon className="h-4 w-4" />} label="创建时间" value={fmtDate(book.created_at)} />
                <InfoRow icon={<CalendarIcon className="h-4 w-4" />} label="最近更新" value={fmtDate(book.updated_at)} />
                <InfoRow icon={<LinkIcon className="h-4 w-4" />} label="访问路径" value={`/${book.slug}`} mono />
              </dl>
            </div>

            <Link href="https://github.com/devlive-community/infosphere/issues" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary-600 hover:underline">
              <HelpCircleIcon className="h-4 w-4" /> 发现内容问题？
            </Link>
          </aside>
        </section>
      </Container>

      {/* 关于这本书 + 目录 */}
      <Container>
        <section className="border-t border-slate-200 py-10">
          <div className="max-w-3xl">
            <h2 className="text-xl font-bold text-slate-900">关于这本书</h2>
            <div className="mt-4 space-y-3 text-[15px] leading-7 text-slate-600">
              {(book.description || '暂无简介').split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
            </div>

            <div className="mb-4 mt-10 flex items-baseline gap-3">
              <h2 className="text-xl font-bold text-slate-900">目录</h2>
              <span className="text-sm text-slate-400">共 {chapters} 个章节</span>
            </div>

            {user && totalChapters > 0 && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">我的阅读进度</span>
                  <span className="text-slate-500">已读 {readCount} / {totalChapters} 章 · {progressPct}%</span>
                </div>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-primary-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {tree.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">暂无章节</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {tree.map((doc, i) => (
                    <li key={doc.id}>
                      <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${doc.slug}`}
                        className="group flex items-center gap-5 border-l-2 border-transparent px-6 py-4 transition-colors hover:bg-primary-50/40">
                        <span className={`w-10 shrink-0 text-center text-2xl font-bold transition-colors group-hover:text-primary-500 ${readSet.has(doc.id) ? 'text-emerald-400' : 'text-slate-300'}`}>{String(i + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-slate-900">{chapterPrefix}{doc.title}</span>
                            {readSet.has(doc.id) && <CheckCircleSmallIcon className="h-4 w-4 shrink-0 text-emerald-500" />}
                          </span>
                          {(doc.children?.length || 0) > 0 && (
                            <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                              {doc.children!.slice(0, 3).map((c) => (
                                <span key={c.id} className={`flex items-center gap-1 text-xs ${readSet.has(c.id) ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  <span className={`h-1 w-1 rounded-full ${readSet.has(c.id) ? 'bg-emerald-500' : 'bg-slate-300'}`} /> {c.title}
                                </span>
                              ))}
                              {doc.children!.length > 3 && <span className="text-xs text-slate-300">…</span>}
                            </span>
                          )}
                        </span>
                        {(doc.children?.length || 0) > 0 && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{doc.children!.length} 节</span>
                        )}
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-primary-500" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </Container>

      {/* 你可能也喜欢 */}
      {related.length > 0 && (
        <section className="border-t border-slate-200 bg-white py-10">
          <Container>
            <h2 className="mb-6 text-xl font-bold text-slate-900">你可能也喜欢</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {related.map((b) => <BookCard key={b.id} book={b} showStatus tagsMax={2} tagsLink={false} dateField="created" />)}
            </div>
          </Container>
        </section>
      )}
    </div>
  )
}

/* ── 辅助 ── */

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-slate-500"><span className="text-slate-400">{icon}</span>{label}</dt>
      <dd className={`min-w-0 text-right ${mono ? 'font-mono text-xs text-primary-600' : 'font-medium text-slate-900'}`}>
        <Tooltip content={value} className="max-w-full"><span className="block truncate">{value}</span></Tooltip>
      </dd>
    </div>
  )
}

function statusName(status: string): string {
  return status === 'published' ? '已发布' : status === 'archived' ? '已归档' : '草稿'
}

function fmtDate(input: string | null | undefined): string {
  if (!input) return '-'
  return input.slice(0, 10)
}

function flatFirst(docs: Document[]): Document | null {
  for (const d of docs) {
    if (d.status === 'published') return d
    const child = d.children ? flatFirst(d.children) : null
    if (child) return child
  }
  return null
}

// flatDocIds 递归收集全部章节 ID（含子章节），用于阅读进度统计
function flatDocIds(docs: Document[]): number[] {
  return docs.flatMap((d) => [d.id, ...flatDocIds(d.children || [])])
}

function flatWords(docs: Document[]): number {
  return docs.reduce((sum, d) => sum + (d.content || '').replace(/\s/g, '').length + flatWords(d.children || []), 0)
}

function ClientFallback({ slug }: { slug: string }) {
  const { user } = useApp()
  if (!user) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 text-center text-sm text-slate-500">
        请<Link href="/login" className="mx-1 text-primary-600">登录</Link>后查看该书籍。
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 text-center text-sm text-slate-500">
      该书籍仅对作者可见。
      <a href={`/book/detail/${encodeURIComponent(slug)}`} className="ml-1 text-primary-600">刷新重试</a>
    </div>
  )
}
