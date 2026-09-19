import Link from 'next/link'
import Container from '@/components/Container'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { authHeaderFrom, getSSRUser, getSiteConfig, isInstalled, serverApi, siteUrlFrom } from '@/lib/server-api'
import { EmptyState, Input, Button, DatePicker, Select, Pagination, SegmentedTabs, LoadingOverlay } from '@/components/ui'
import Seo from '@/components/Seo'
import BookCard from '@/components/BookCard'
import HighlightText from '@/components/HighlightText'
import { BookIcon, FileTextIcon, SearchIcon } from '@/components/icons'
import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/router'
import { useTranslation } from '@/lib/i18n'
import type { Book, Tag, User } from '@/lib/types'

type SearchType = 'all' | 'book' | 'document'

interface SearchDoc {
  id: number
  book_id: number
  book_slug: string
  book_title: string
  doc_slug: string
  title: string
  excerpt: string
  updated_at: string
}

interface SearchResult {
  books: Book[]
  documents: SearchDoc[]
  book_total: number
  document_total: number
  total: number
  page: number
  page_size: number
}

interface SearchFilters {
  type: SearchType
  author: string
  tag: string
  updatedFrom: string
  updatedTo: string
}

interface SearchPageProps {
  installed: boolean
  user: User | null
  site: Record<string, string>
  siteUrl: string
  q: string
  filters: SearchFilters
  tags: Tag[]
  result: SearchResult
}

const emptyResult = (page = 1): SearchResult => ({
  books: [], documents: [], book_total: 0, document_total: 0, total: 0, page, page_size: 12,
})

function stringQuery(value: string | string[] | undefined, max = 100): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export const getServerSideProps: GetServerSideProps<SearchPageProps> = async ({ req, query }) => {
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const auth = authHeaderFrom(req)
  const user = await getSSRUser(req)
  const q = stringQuery(query.q)
  const rawType = stringQuery(query.type, 20)
  const filters: SearchFilters = {
    type: rawType === 'book' || rawType === 'document' ? rawType : 'all',
    author: stringQuery(query.author, 50),
    tag: stringQuery(query.tag, 50),
    updatedFrom: stringQuery(query.updated_from, 10),
    updatedTo: stringQuery(query.updated_to, 10),
  }
  const page = Math.max(1, Number.parseInt(stringQuery(query.page, 8), 10) || 1)
  const [site, tags, result] = await Promise.all([
    getSiteConfig(),
    serverApi<Tag[]>('/tags', { params: { limit: 200 } }).catch(() => []),
    q
      ? serverApi<SearchResult>('/search', {
          headers: auth,
          params: {
            q, type: filters.type, author: filters.author, tag: filters.tag,
            updated_from: filters.updatedFrom, updated_to: filters.updatedTo, page, page_size: 12,
          },
        }).catch(() => emptyResult(page))
      : Promise.resolve(emptyResult(page)),
  ])
  return { props: { installed: true, user, site, siteUrl: siteUrlFrom(req), q, filters, tags, result } }
}

export default function SearchPage({ site, q, filters, tags, result }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter()
  const { t } = useTranslation()
  const siteName = site.site_name || 'InfoSphere'
  const tagsEnabled = Array.isArray((site as Record<string, unknown>).feature_plugins) && ((site as Record<string, unknown>).feature_plugins as string[]).includes('tags')
  const [keyword, setKeyword] = useState(q)
  const [draft, setDraft] = useState(filters)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setKeyword(q)
    setDraft({
      type: filters.type,
      author: filters.author,
      tag: filters.tag,
      updatedFrom: filters.updatedFrom,
      updatedTo: filters.updatedTo,
    })
    setLoading(false)
  }, [q, filters.type, filters.author, filters.tag, filters.updatedFrom, filters.updatedTo, result.page])

  function navigate(next: SearchFilters, page = 1, nextKeyword = keyword) {
    const params = new URLSearchParams()
    const cleanKeyword = nextKeyword.trim()
    if (cleanKeyword) params.set('q', cleanKeyword)
    if (next.type !== 'all') params.set('type', next.type)
    if (next.author.trim()) params.set('author', next.author.trim())
    if (next.tag) params.set('tag', next.tag)
    if (next.updatedFrom.trim()) params.set('updated_from', next.updatedFrom.trim())
    if (next.updatedTo.trim()) params.set('updated_to', next.updatedTo.trim())
    if (page > 1) params.set('page', String(page))
    setLoading(true)
    void router.push(`/search${params.size ? `?${params.toString()}` : ''}`)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    navigate(draft)
  }

  const typeItems = [
    { value: 'all', label: t('search.tab.all', { n: result.book_total + result.document_total }) },
    { value: 'book', label: t('search.tab.book', { n: result.book_total }) },
    { value: 'document', label: t('search.tab.document', { n: result.document_total }) },
  ]

  return (
    <>
      <Seo siteName={siteName} title={q ? t('search.seo.resultTitle', { q }) : t('search.seo.title')} noindex />
      <Container>
        <div className="py-8">
          <h1 className="text-2xl font-bold text-ink">{t('search.heading')}</h1>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="flex max-w-3xl flex-col gap-2 sm:flex-row">
              <Input className="flex-1" value={keyword} onChange={(event) => setKeyword(event.target.value)}
                leading={<SearchIcon className="h-4 w-4" />} placeholder={t('search.placeholder')} maxLength={100} />
              <Button type="submit" loading={loading} className="w-full sm:w-auto">{t('search.submit')}</Button>
            </div>
            <div className={`grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 ${tagsEnabled ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              <Input value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })}
                placeholder={t('search.authorPlaceholder')} maxLength={50} />
              {tagsEnabled && <Select value={draft.tag} onChange={(tag) => setDraft({ ...draft, tag })}
                options={[{ value: '', label: t('search.allTags') }, ...tags.map((tag) => ({ value: tag.slug, label: tag.name }))]} />}
              <DatePicker value={draft.updatedFrom} onChange={(value) => setDraft({ ...draft, updatedFrom: value })}
                placeholder={t('search.updatedFrom')} max={draft.updatedTo || undefined} ariaLabel={t('search.updatedFrom')} />
              <DatePicker value={draft.updatedTo} onChange={(value) => setDraft({ ...draft, updatedTo: value })}
                placeholder={t('search.updatedTo')} min={draft.updatedFrom || undefined} ariaLabel={t('search.updatedTo')} />
            </div>
          </form>
          {q && <p className="mt-3 text-sm text-slate-400">{t('search.resultCount', { q, total: result.total })}</p>}
        </div>

        {q && (
          <SegmentedTabs className="sm:!w-auto" size="sm" fullWidth value={filters.type} items={typeItems} ariaLabel={t('search.seo.title')}
            onChange={(value) => navigate({ ...filters, type: value as SearchType }, 1, q)} />
        )}

        <LoadingOverlay show={loading}>
          <div className="min-h-56 pb-10">
            {!q && (
              <EmptyState>
                <SearchIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                {t('search.emptyPrompt')}
              </EmptyState>
            )}

            {q && result.total === 0 && (
              <EmptyState>
                <SearchIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                {t('search.noResult', { q })}
              </EmptyState>
            )}

            {result.books.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <BookIcon className="h-5 w-5 text-primary-500" /> {t('search.section.books')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {result.books.map((book) => <BookCard key={book.id} book={book} highlight={q} />)}
                </div>
              </section>
            )}

            {result.documents.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <FileTextIcon className="h-5 w-5 text-primary-500" /> {t('search.section.documents')}
                </h2>
                <div className="space-y-3">
                  {result.documents.map((document) => (
                    <Link key={document.id} href={`/book/reader/${encodeURIComponent(document.book_slug)}/${encodeURIComponent(document.doc_slug)}`}
                      className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                      <span className="block truncate font-medium text-slate-900 group-hover:text-primary-600">
                        <HighlightText text={document.title} query={q} />
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">{t('search.fromBook', { book: document.book_title })}</span>
                      <span className="mt-1 block line-clamp-2 text-sm leading-6 text-slate-500">
                        <HighlightText text={document.excerpt} query={q} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {q && result.total > 0 && (
              <Pagination page={result.page} pageSize={result.page_size} total={result.total}
                onChange={(page) => navigate(filters, page, q)} />
            )}
          </div>
        </LoadingOverlay>
      </Container>
    </>
  )
}
