import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { serverApi, getSiteConfig, siteUrlFrom, authHeaderFrom, excerptFrom } from '@/lib/server-api'
import { useApp } from '@/lib/auth'
import { StatusBadge } from '@/components/BookCard'
import DocTree from '@/components/DocTree'
import Seo from '@/components/Seo'
import type { Book, Document } from '@/lib/types'

interface BookDetailProps {
  site: Record<string, string>
  siteUrl: string
  book: Book
  tree: Document[]
  /** true 表示 SSR 阶段无法公开访问（草稿/私有），交给客户端携带令牌重试 */
  needsAuth: boolean
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

export const getServerSideProps: GetServerSideProps<BookDetailProps> = async ({ req, query }) => {
  const slug = typeof query.slug === 'string' ? query.slug : ''
  if (!slug) return { notFound: true }

  const auth = authHeaderFrom(req)
  const [site, first] = await Promise.all([getSiteConfig(), fetchBook(slug, auth)])

  // 公开访问失败且用户带了令牌（草稿/私有书），交给客户端重试
  if (!first.book) {
    if (auth.Authorization) {
      return { props: { site, siteUrl: siteUrlFrom(req), book: null as unknown as Book, tree: [], needsAuth: true } }
    }
    return { notFound: true }
  }
  return { props: { site, siteUrl: siteUrlFrom(req), book: first.book, tree: first.tree, needsAuth: false } }
}

export default function BookDetail({ site, siteUrl, book, tree, needsAuth }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { user } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const chapterPrefix = book?.chapter_prefix || ''

  const canManage = user && book && (user.id === book.user_id || user.role === 'admin')

  if (needsAuth || !book) {
    // 私有内容：客户端带令牌重试
    return <ClientFallback slug={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('slug') || '' : ''} />
  }

  const bookUrl = `${siteUrl}/book/detail?slug=${encodeURIComponent(book.slug)}`
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Book',
      name: book.title,
      description: book.description || undefined,
      author: { '@type': 'Person', name: book.user?.username || '佚名' },
      url: bookUrl,
      inLanguage: 'zh-CN',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: '发现', item: `${siteUrl}/explore` },
        { '@type': 'ListItem', position: 3, name: book.title, item: bookUrl },
      ],
    },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Seo
        siteName={siteName}
        title={book.title}
        description={excerptFrom(book.description || `${book.title} — ${book.user?.username || ''} 的知识书籍`, 160)}
        url={bookUrl}
        image={book.cover_image || undefined}
        jsonLd={jsonLd}
      />

      <div>
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{book.title}</h1>
              <p className="mt-1 text-sm text-slate-400">/ {book.slug}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={book.status} />
              {book.is_public && <span className="badge bg-sky-50 text-sky-600">公开</span>}
            </div>
          </div>
          <p className="mt-3 text-slate-600">{book.description || '暂无简介'}</p>
          <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
            {book.user && (
              <Link href={`/user/home?username=${encodeURIComponent(book.user.username)}`} className="flex items-center gap-2 hover:text-primary-600">
                {book.user.avatar
                  ? <img src={book.user.avatar} alt={book.user.username} className="h-6 w-6 rounded-full object-cover" />
                  : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-white">{book.user.username[0]?.toUpperCase()}</span>}
                {book.user.username}
              </Link>
            )}
            <span>👁 {book.view_count}</span>
          </div>
          {canManage && (
            <div className="mt-4 flex gap-2">
              <Link href={`/book/writer?slug=${encodeURIComponent(book.slug)}`} className="btn-primary">+ 新建章节</Link>
              <Link href={`/books/edit?slug=${encodeURIComponent(book.slug)}`} className="btn-outline">书籍设置</Link>
            </div>
          )}
        </div>
      </div>

      <aside className="card h-fit p-4">
        <h2 className="mb-2 px-2 text-sm font-bold text-slate-900">目录</h2>
        <DocTree
          items={tree}
          itemRender={(doc) => (
            <Link href={`/book/reader?slug=${encodeURIComponent(book.slug)}&doc=${doc.slug}`} className="flex-1 truncate hover:text-primary-600">
              {chapterPrefix}{doc.title}
            </Link>
          )}
        />
        {canManage && (
          <Link href={`/book/writer?slug=${encodeURIComponent(book.slug)}`} className="btn-outline mt-3 w-full">管理章节</Link>
        )}
      </aside>
    </div>
  )
}

function ClientFallback({ slug }: { slug: string }) {
  const { user } = useApp()
  if (!user) {
    return (
      <div className="card p-6 text-center text-sm text-slate-500">
        请<Link href="/login" className="mx-1 text-primary-600">登录</Link>后查看该书籍。
      </div>
    )
  }
  return (
    <div className="card p-6 text-center text-sm text-slate-500">
      该书籍仅对作者可见。
      <a href={`/book/detail?slug=${encodeURIComponent(slug)}`} className="ml-1 text-primary-600">刷新重试</a>
    </div>
  )
}
