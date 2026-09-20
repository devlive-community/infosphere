import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'

interface Variant { slug: string; title: string; version: string; current: boolean; first_doc_slug?: string }

// BookVersions 阅读入口的版本切换：同一版本组内可见书籍互相跳转（少于两本时不显示）。
// linkTo='reader' 时切换后停留在阅读页（跳到该书首个可读章节），否则跳到详情页。
export default function BookVersions({ bookId, linkTo = 'detail' }: { bookId: number; linkTo?: 'detail' | 'reader' }) {
  const { t } = useTranslation()
  const { site } = useApp()
  const enabled = (site.feature_plugins || []).includes('book-versions')
  const [items, setItems] = useState<Variant[]>([])
  useEffect(() => {
    if (!enabled) return
    api<{ items: Variant[] }>(`/books/${bookId}/versions`).then((d) => setItems(d.items || [])).catch(() => { /* 忽略 */ })
  }, [bookId, enabled])
  if (!enabled || items.length < 2) return null
  const hrefFor = (v: Variant) =>
    linkTo === 'reader' && v.first_doc_slug
      ? `/book/reader/${encodeURIComponent(v.slug)}/${encodeURIComponent(v.first_doc_slug)}`
      : `/book/detail/${encodeURIComponent(v.slug)}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-400">{t('book.variant.version')}</span>
      {[...items].reverse().map((v) => (v.current ? (
        <span key={v.slug} className="rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-white">{v.version || v.title}</span>
      ) : (
        <Link key={v.slug} href={hrefFor(v)}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50">{v.version || v.title}</Link>
      )))}
    </div>
  )
}
