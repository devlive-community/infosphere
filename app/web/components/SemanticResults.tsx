import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Loading } from '@/components/ui'

interface SemanticItem {
  id: number
  book_slug: string
  book_title: string
  doc_slug: string
  title: string
  heading: string
  anchor: string
  excerpt: string
}

// SemanticResults 搜索页的「语义相关」：按意思而非关键词匹配的章节小节（站点开启语义检索时才有），单独加载，不拖慢关键词结果；
// 已在关键词结果中出现的章节不重复显示。
export default function SemanticResults({ q, book, exclude }: { q: string; book?: string; exclude: number[] }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<SemanticItem[] | null>(null)
  const excludeKey = exclude.join(',')

  useEffect(() => {
    let active = true
    setItems(null)
    api<{ available: boolean; items: SemanticItem[] }>('/search/semantic', { params: { q, book } })
      .then((d) => { if (active) setItems(d.available ? d.items : []) })
      .catch(() => { if (active) setItems([]) })
    return () => { active = false }
  }, [q, book])

  const skip = new Set(excludeKey ? excludeKey.split(',').map(Number) : [])
  const shown = (items || []).filter((it) => !skip.has(it.id))
  if (items !== null && shown.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
        <i className="fa-solid fa-wand-magic-sparkles text-primary-500" aria-hidden="true" /> {t('search.semantic.title')}
      </h2>
      <p className="mb-4 text-xs text-slate-400">{t('search.semantic.hint')}</p>
      {items === null ? <Loading className="py-6" label={t('search.semantic.loading')} /> : (
        <div className="space-y-3">
          {shown.map((it) => (
            <Link key={it.id} href={`/book/reader/${encodeURIComponent(it.book_slug)}/${encodeURIComponent(it.doc_slug)}${it.anchor ? `#${it.anchor}` : ''}`}
              className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <span className="block truncate font-medium text-slate-900 group-hover:text-primary-600">
                {it.title}{it.heading && <span className="text-slate-400"> › {it.heading}</span>}
              </span>
              <span className="mt-1 block text-xs text-slate-400">{t('search.fromBook', { book: it.book_title })}</span>
              <span className="mt-1 block line-clamp-2 text-sm leading-6 text-slate-500">{it.excerpt}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
