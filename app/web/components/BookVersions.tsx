import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Select } from '@/components/ui'

interface Variant { slug: string; title: string; version: string; current: boolean; is_latest?: boolean; first_doc_slug?: string }

// cmpVersion 只按版本号里的数字段比较（如 0.8.0-incubating → [0,8,0]），忽略「最新版」等文字。
function cmpVersion(a: string, b: string): number {
  const parse = (s: string) => (s.match(/\d+/g) || []).map(Number)
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return (a || '').localeCompare(b || '')
}

// BookVersions 阅读入口的版本切换：同一版本组内可见书籍互相跳转（少于两本时不显示）。
// 用下拉选择（版本倒序），避免版本过多时换行挤占阅读页目录空间。linkTo='reader' 时切换后停留在阅读页。
export default function BookVersions({ bookId, linkTo = 'detail' }: { bookId: number; linkTo?: 'detail' | 'reader' }) {
  const { t } = useTranslation()
  const { site } = useApp()
  const router = useRouter()
  const enabled = (site.feature_plugins || []).includes('book-versions')
  const [items, setItems] = useState<Variant[]>([])
  useEffect(() => {
    if (!enabled) return
    api<{ items: Variant[] }>(`/books/${bookId}/versions`).then((d) => setItems(d.items || [])).catch(() => { /* 忽略 */ })
  }, [bookId, enabled])
  if (!enabled || items.length < 2) return null
  // 只按版本号排序（默认 desc 大版本在前）；「最新版」只是标记，不参与排序。
  const asc = site.book_versions_sort === 'asc'
  const ordered = [...items].sort((a, b) => (asc ? cmpVersion(a.version, b.version) : cmpVersion(b.version, a.version)))
  const current = items.find((v) => v.current)
  const hrefFor = (v: Variant) =>
    linkTo === 'reader' && v.first_doc_slug
      ? `/book/reader/${encodeURIComponent(v.slug)}/${encodeURIComponent(v.first_doc_slug)}`
      : `/book/detail/${encodeURIComponent(v.slug)}`
  // 详情页用内容宽度（避免全宽拉伸显得笨重）；阅读页侧栏窄，仍用全宽填满。
  const compact = linkTo === 'detail'
  const latestLabel = t('book.variant.latest')
  return (
    <div className={`flex min-w-0 items-center gap-2 text-sm ${compact ? 'w-auto' : ''}`}>
      <span className="shrink-0 text-slate-400">{t('book.variant.version')}</span>
      <div className={compact ? 'w-48 max-w-full' : 'min-w-0 flex-1'}>
        <Select size="sm" searchable value={current?.slug || ''}
          onChange={(value) => { const v = items.find((x) => x.slug === value); if (v && !v.current) router.push(hrefFor(v)) }}
          options={ordered.map((v) => ({ value: v.slug, label: (v.version || v.title) + (v.is_latest ? ` · ${latestLabel}` : '') }))} />
      </div>
      {current?.is_latest && (
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-100">{latestLabel}</span>
      )}
    </div>
  )
}
