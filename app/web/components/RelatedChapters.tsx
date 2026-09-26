import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'

interface RelatedDoc { id: number; title: string; slug: string; book_id: number; book_slug: string; book_title: string }

// RelatedChapters 阅读页正文后的「相关阅读」：内容相近的其他章节（站点开启语义检索时才有，没有时不显示）。
export default function RelatedChapters({ docId, bookId }: { docId: number; bookId: number }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<RelatedDoc[]>([])
  useEffect(() => {
    let active = true
    setItems([])
    api<{ items: RelatedDoc[] }>(`/documents/${docId}/related`, { params: { limit: 5 } })
      .then((d) => { if (active) setItems(d.items) })
      .catch(() => { /* 忽略 */ })
    return () => { active = false }
  }, [docId])
  if (items.length === 0) return null
  return (
    <section className="mt-10 rounded-xl border border-slate-200 bg-white p-5" aria-label={t('reader.related.title')}>
      <h2 className="text-base font-bold text-slate-900">{t('reader.related.title')}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((d) => (
          <li key={d.id}>
            <Link href={`/book/reader/${encodeURIComponent(d.book_slug)}/${encodeURIComponent(d.slug)}`} className="group flex items-baseline gap-2 text-sm">
              <i className="fa-solid fa-file-lines text-xs text-slate-300" aria-hidden="true" />
              <span className="text-slate-700 group-hover:text-primary-600">{d.title}</span>
              {d.book_id !== bookId && <span className="truncate text-xs text-slate-400">{t('search.fromBook', { book: d.book_title })}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
