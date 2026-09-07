import Link from 'next/link'
import Container from '@/components/Container'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { authHeaderFrom, getSSRUser, getSiteConfig, isInstalled, serverApi, siteUrlFrom } from '@/lib/server-api'
import { EmptyState, Input, Button } from '@/components/ui'
import Seo from '@/components/Seo'
import BookCard from '@/components/BookCard'
import { BookIcon, FileTextIcon, SearchIcon } from '@/components/icons'
import { useState, FormEvent } from 'react'
import type { Book, User } from '@/lib/types'

interface SearchDoc {
  id: number
  book_id: number
  book_slug: string
  doc_slug: string
  title: string
  excerpt: string
}

interface SearchResult {
  books: Book[]
  documents: SearchDoc[]
  total: number
}

interface SearchPageProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  q: string
  result: SearchResult
}

export const getServerSideProps: GetServerSideProps<SearchPageProps> = async ({ req, query }) => {
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const auth = authHeaderFrom(req)
  const user = await getSSRUser(req)
  const q = (typeof query.q === 'string' && query.q.slice(0, 100)) || ''
  const [site, result] = await Promise.all([
    getSiteConfig(),
    q
      ? serverApi<SearchResult>('/search', { params: { q } }).catch(() => ({ books: [], documents: [], total: 0 }) as SearchResult)
      : Promise.resolve({ books: [], documents: [], total: 0 } as SearchResult),
  ])
  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), q, result } }
}

export default function SearchPage({ site, siteUrl, q, result }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const [keyword, setKeyword] = useState(q)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (keyword.trim()) window.location.href = `/search?q=${encodeURIComponent(keyword.trim())}`
  }

  return (
    <>
      <Seo siteName={siteName} title={`「${q}」的搜索结果`} noindex />
      <Container>
        <div className="py-8">
          <h1 className="text-2xl font-bold text-ink">搜索</h1>
          <form onSubmit={submit} className="mt-4 max-w-xl">
            <div className="flex gap-2">
              <Input className="flex-1" value={keyword} onChange={(e) => setKeyword(e.target.value)} leading={<SearchIcon className="h-4 w-4" />}
                placeholder="搜索书籍、章节内容…" maxLength={100} />
              <Button type="submit">搜索</Button>
            </div>
          </form>
          {q && <p className="mt-3 text-sm text-slate-400">「{q}」共 {result.total} 条结果</p>}
        </div>

        {!q && (
          <EmptyState>
            <SearchIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            输入关键词，搜索公开书籍与章节内容
          </EmptyState>
        )}

        {q && result.total === 0 && (
          <EmptyState>
            <SearchIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            未找到与「{q}」相关的内容，换个关键词试试
          </EmptyState>
        )}

        {result.books.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <BookIcon className="h-5 w-5 text-primary-500" /> 书籍
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result.books.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          </section>
        )}

        {result.documents.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <FileTextIcon className="h-5 w-5 text-primary-500" /> 章节
            </h2>
            <div className="space-y-3">
              {result.documents.map((d) => (
                <Link key={d.id} href={`/book/reader/${encodeURIComponent(d.book_slug)}/${encodeURIComponent(d.doc_slug)}`}
                  className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                  <span className="block truncate font-medium text-slate-900 group-hover:text-primary-600">{d.title}</span>
                  <span className="mt-1 block truncate text-sm text-slate-500">{d.excerpt}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </Container>
    </>
  )
}
