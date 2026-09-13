import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

interface Variant { slug: string; title: string; version: string; current: boolean }

// BookVersions 阅读入口的版本切换：同一版本组内可见书籍互相跳转（少于两本时不显示）。
export default function BookVersions({ bookId }: { bookId: number }) {
  const [items, setItems] = useState<Variant[]>([])
  useEffect(() => {
    api<{ items: Variant[] }>(`/books/${bookId}/versions`).then((d) => setItems(d.items || [])).catch(() => { /* 忽略 */ })
  }, [bookId])
  if (items.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-400">版本</span>
      {items.map((v) => (v.current ? (
        <span key={v.slug} className="rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-white">{v.version || v.title}</span>
      ) : (
        <Link key={v.slug} href={`/book/detail/${encodeURIComponent(v.slug)}`}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50">{v.version || v.title}</Link>
      )))}
    </div>
  )
}
