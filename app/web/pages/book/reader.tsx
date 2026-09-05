import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { serverApi, getSiteConfig, siteUrlFrom, authHeaderFrom, excerptFrom, isInstalled } from '@/lib/server-api'
import { renderMarkdown } from '@/lib/markdown'
import { useApp } from '@/lib/auth'
import DocTree from '@/components/DocTree'
import Seo from '@/components/Seo'
import type { Book, Document } from '@/lib/types'

interface ReaderProps {
  installed: boolean
  site: Record<string, string>
  siteUrl: string
  book: Book
  doc: Document
  html: string
  tree: Document[]
  needsAuth: boolean
}

function flatten(docs: Document[]): Document[] {
  return docs.flatMap((d) => [d, ...flatten(d.children || [])])
}

export const getServerSideProps: GetServerSideProps<ReaderProps> = async ({ req, query }) => {
  // 未安装时强制进入安装向导（服务端重定向，不渲染任何内容）
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }

  const slug = typeof query.slug === 'string' ? query.slug : ''
  const docSlug = typeof query.doc === 'string' ? query.doc : ''
  if (!slug) return { notFound: true }

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
    return { props: { installed: true,  site, siteUrl: siteUrlFrom(req), book, doc: doc as Document, html: doc ? renderMarkdown(doc.content) : '', tree, needsAuth: false } }
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500
    if (status === 404) return { notFound: true }
    // 401/403：私有内容，交给客户端带令牌重试
    return { props: { installed: true,  site, siteUrl: siteUrlFrom(req), book: null as unknown as Book, doc: null as unknown as Document, html: '', tree: [], needsAuth: true } }
  }
}

export default function Reader({ site, siteUrl, book, doc, html, tree, needsAuth }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const chapterPrefix = book?.chapter_prefix || ''

  if (needsAuth || !book) {
    return (
      <div className="card p-6 text-center text-sm text-slate-500">
        该章节仅对作者可见，请<Link href="/login" className="mx-1 text-primary-600">登录</Link>后查看。
      </div>
    )
  }

  const flat = flatten(tree)
  const index = doc ? flat.findIndex((d) => d.id === doc.id) : -1
  const prev = index > 0 ? flat[index - 1] : null
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null

  const docUrl = doc ? `${siteUrl}/book/reader?slug=${encodeURIComponent(book.slug)}&doc=${encodeURIComponent(doc.slug)}` : siteUrl
  const jsonLd = doc ? [
    {
      '@context': 'https://schema.org',
      '@type': 'Chapter',
      name: `${chapterPrefix}${doc.title}`,
      url: docUrl,
      datePublished: doc.created_at,
      dateModified: doc.updated_at,
      isPartOf: { '@type': 'Book', name: book.title },
      author: { '@type': 'Person', name: book.user?.username || '佚名' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: book.title, item: `${siteUrl}/book/detail?slug=${encodeURIComponent(book.slug)}` },
        { '@type': 'ListItem', position: 3, name: doc.title, item: docUrl },
      ],
    },
  ] : undefined

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Seo
        siteName={siteName}
        title={doc ? `${chapterPrefix}${doc.title} · ${book.title}` : book.title}
        description={doc ? excerptFrom(doc.content || book.description, 160) : book.description}
        url={docUrl}
        image={book.cover_image || undefined}
        jsonLd={jsonLd}
      />

      <aside className="card h-fit p-4 lg:sticky lg:top-20">
        <Link href={`/book/detail?slug=${encodeURIComponent(book.slug)}`} className="mb-2 block px-2 text-sm font-bold text-slate-900 hover:text-primary-600">
          📖 {book.title}
        </Link>
        <DocTree
          items={tree}
          activeId={doc?.id}
          itemRender={(d) => (
            <Link href={`/book/reader?slug=${encodeURIComponent(book.slug)}&doc=${d.slug}`}
              className="flex-1 truncate hover:text-primary-600">{chapterPrefix}{d.title}</Link>
          )}
        />
      </aside>

      <article className="card min-h-[60vh] p-8">
        {doc ? (
          <>
            <h1 className="mb-6 text-2xl font-bold text-slate-900">{chapterPrefix}{doc.title}</h1>
            {/* 服务端渲染的正文 HTML（SSR 时已生成，客户端复用同一份） */}
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />

            <div className="mt-10 flex justify-between border-t border-slate-100 pt-4 text-sm">
              {prev ? (
                <Link href={`/book/reader?slug=${encodeURIComponent(book.slug)}&doc=${prev.slug}`} className="text-primary-600 hover:underline">
                  ← {chapterPrefix}{prev.title}
                </Link>
              ) : <span />}
              {next && (
                <Link href={`/book/reader?slug=${encodeURIComponent(book.slug)}&doc=${next.slug}`} className="text-primary-600 hover:underline">
                  {chapterPrefix}{next.title} →
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="py-20 text-center text-slate-400">
            <p>请从左侧目录选择章节开始阅读</p>
            {flat.length === 0 && <p className="mt-2 text-xs">本书暂无已发布章节</p>}
          </div>
        )}
      </article>
    </div>
  )
}
