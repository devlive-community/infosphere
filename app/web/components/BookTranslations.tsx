import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'

interface Variant { slug: string; title: string; language: string; current: boolean; first_doc_slug?: string }

// BookTranslations 阅读入口的语言切换：同一翻译组内可见书籍互相跳转（少于两本时不显示）。
// linkTo='reader' 时切换后停留在阅读页（跳到该书首个可读章节），否则跳到详情页。
export default function BookTranslations({ bookId, linkTo = 'detail' }: { bookId: number; linkTo?: 'detail' | 'reader' }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Variant[]>([])
  useEffect(() => {
    api<{ items: Variant[] }>(`/books/${bookId}/translations`).then((d) => setItems(d.items || [])).catch(() => { /* 忽略 */ })
  }, [bookId])
  if (items.length < 2) return null
  const hrefFor = (v: Variant) =>
    linkTo === 'reader' && v.first_doc_slug
      ? `/book/reader/${encodeURIComponent(v.slug)}/${encodeURIComponent(v.first_doc_slug)}`
      : `/book/detail/${encodeURIComponent(v.slug)}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-400">{t('book.variant.language')}</span>
      {items.map((v) => (v.current ? (
        <span key={v.slug} className="rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-white">{v.language || v.title}</span>
      ) : (
        <Link key={v.slug} href={hrefFor(v)}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50">{v.language || v.title}</Link>
      )))}
    </div>
  )
}
