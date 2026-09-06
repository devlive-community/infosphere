import Link from 'next/link'
import Container from '@/components/Container'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { serverApi, getSiteConfig, siteUrlFrom, authHeaderFrom, excerptFrom, isInstalled, getSSRUser } from '@/lib/server-api'
import { API_BASE, formatNumber } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import { useApp } from '@/lib/auth'
import { getReadingProgress } from '@/lib/reading-progress'
import { useEffect, useState } from 'react'
import { ButtonLink , Tooltip} from '@/components/ui'
import UserAvatar from '@/components/UserAvatar'
import TagChips from '@/components/TagChips'
import BookCard from '@/components/BookCard'
import Seo from '@/components/Seo'
import {
  BookIcon, CalendarIcon, CheckCircleSmallIcon, ChevronRightIcon, EyeIcon,
  GlobeIcon, HelpCircleIcon, LinkIcon, ShareIcon, BookmarkIcon, ClockIcon,
} from '@/components/icons'
import type { Book, Document, User } from '@/lib/types'

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
      return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), book: null as unknown as Book, tree: [], needsAuth: true, related: [] } }
    }
    return { notFound: true }
  }

  // 你可能也喜欢：同标签的其它公开书籍
  const tagSlug = first.book.tags?.[0]?.slug
  const related = tagSlug
    ? await serverApi<Book[]>(`/tags/${encodeURIComponent(tagSlug)}/books`, { params: { page_size: 6 } })
        .then((d) => (d as unknown as { items?: Book[] }).items || []).catch(() => [] as Book[])
    : []

  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), book: first.book, tree: first.tree, needsAuth: false, related: related.filter((b) => b.id !== first.book!.id).slice(0, 3) } }
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

export default function BookDetail({ site, siteUrl, book, tree, related, needsAuth }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { user } = useApp()
  // 阅读进度仅存在于本地，客户端挂载后读取（避免水合不一致）
  const [progress, setProgress] = useState<{ docSlug: string; docTitle: string; chapterPrefix?: string } | null>(null)
  const bookSlugSafe = book?.slug || ''
  const username = user?.username || ''
  useEffect(() => {
    if (username && book) {
      getReadingProgress(username, book.id).then(setProgress)
    }
  }, [username, book])
  const siteName = site.site_name || 'InfoSphere'
  const chapterPrefix = book?.chapter_prefix || ''

  const canManage = !!user && !!book && (user.id === book.user_id || user.role === 'admin')

  if (needsAuth || !book) {
    return <ClientFallback slug={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('slug') || '' : ''} />
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
      alert('链接已复制到剪贴板')
    } catch {
      window.prompt('复制以下链接分享本书', bookUrl)
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
        <section className="grid gap-10 pb-10 lg:grid-cols-[300px_1fr_300px]">
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
              <Tooltip content="收藏"><button type="button" onClick={() => alert('收藏功能即将上线')}
                className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400">
                  <BookmarkIcon className="h-4 w-4" /> 收藏
                </button></Tooltip>
              <Tooltip content="分享"><button type="button" onClick={share}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700">
                  <ShareIcon className="h-4 w-4" />
                </button></Tooltip>
              {canManage && (
                <ButtonLink href={`/book/writer/${encodeURIComponent(book.slug)}`} variant="outline" className="h-11">写作</ButtonLink>
              )}
            </div>
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

            {author && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 font-bold text-slate-900">关于作者</h2>
                <div className="flex items-center gap-3">
                  <UserAvatar user={author} size="h-12 w-12" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{author.username}</div>
                    {author.bio && <div className="line-clamp-2 text-xs text-slate-500">{author.bio}</div>}
                  </div>
                </div>
                <Link href={`/user/${encodeURIComponent(author.username)}`}
                  className="mt-4 flex h-9 w-full items-center justify-center rounded-lg border border-slate-300 text-sm text-slate-700 transition-colors hover:border-primary-400 hover:text-primary-600">
                  查看全部作品
                </Link>
              </div>
            )}

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
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {tree.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">暂无章节</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {tree.map((doc, i) => (
                    <li key={doc.id}>
                      <Link href={`/book/reader/${encodeURIComponent(book.slug)}/${doc.slug}`}
                        className="group flex items-center gap-5 border-l-2 border-transparent px-6 py-4 transition-colors hover:bg-primary-50/40">
                        <span className="w-10 shrink-0 text-center text-2xl font-bold text-slate-300 transition-colors group-hover:text-primary-500">{String(i + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-slate-900">{chapterPrefix}{doc.title}</span>
                          {(doc.children?.length || 0) > 0 && (
                            <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                              {doc.children!.slice(0, 3).map((c) => (
                                <span key={c.id} className="flex items-center gap-1 text-xs text-slate-400">
                                  <span className="h-1 w-1 rounded-full bg-slate-300" /> {c.title}
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
              {related.map((b) => <BookCard key={b.id} book={b} />)}
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
      <dt className="flex items-center gap-2 text-slate-500"><span className="text-slate-400">{icon}</span>{label}</dt>
      <dd className={`truncate text-right ${mono ? 'font-mono text-xs text-primary-600' : 'font-medium text-slate-900'}`}>{value}</dd>
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
