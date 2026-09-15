import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Input, Loading } from '@/components/ui'
import HighlightText from '@/components/HighlightText'
import { SearchIcon, CloseIcon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n'

interface ChapterHit {
  id: number
  book_slug: string
  doc_slug: string
  title: string
  excerpt: string
}

interface SearchResponse {
  documents: ChapterHit[]
  document_total: number
}

// 书籍详情页内的「本书章节搜索」：按 slug 限定在当前书籍内检索章节，命中词高亮。
export default function BookSearch({ bookSlug }: { bookSlug: string }) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<ChapterHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const q = keyword.trim()
    if (!q) {
      setHits([])
      setTotal(0)
      setSearched(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const id = ++reqId.current
    const timer = setTimeout(() => {
      api<SearchResponse>('/search', { params: { q, book: bookSlug, type: 'document', page_size: 20 } })
        .then((d) => {
          if (id !== reqId.current) return
          setHits(d.documents || [])
          setTotal(d.document_total || 0)
          setSearched(true)
        })
        .catch(() => {
          if (id !== reqId.current) return
          setHits([])
          setTotal(0)
          setSearched(true)
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword, bookSlug])

  const q = keyword.trim()

  return (
    <div className="mb-4">
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        leading={<SearchIcon className="h-4 w-4" />}
        trailing={keyword ? (
          <button type="button" onClick={() => setKeyword('')} aria-label={t('bookSearch.clear')} className="text-slate-400 transition-colors hover:text-slate-600">
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : undefined}
        placeholder={t('bookSearch.placeholder')}
        maxLength={100}
      />

      {q && (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading && hits.length === 0 ? (
            <Loading className="py-6" label={t('bookSearch.searching')} />
          ) : searched && hits.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t('bookSearch.noResults', { q })}</p>
          ) : (
            <>
              <p className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-400">{t('bookSearch.hitCount', { n: total })}</p>
              <ul className="divide-y divide-slate-100">
                {hits.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/book/reader/${encodeURIComponent(doc.book_slug)}/${encodeURIComponent(doc.doc_slug)}`}
                      className="group block px-4 py-3 transition-colors hover:bg-primary-50/40"
                    >
                      <span className="block truncate font-medium text-slate-900 group-hover:text-primary-600">
                        <HighlightText text={doc.title} query={q} />
                      </span>
                      {doc.excerpt && (
                        <span className="mt-1 block line-clamp-2 text-sm leading-6 text-slate-500">
                          <HighlightText text={doc.excerpt} query={q} />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
