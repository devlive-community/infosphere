import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Select } from '@/components/ui'

interface Variant { slug: string; title: string; version: string; current: boolean; first_doc_slug?: string }

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
  const ordered = [...items].reverse()
  const current = items.find((v) => v.current)
  const hrefFor = (v: Variant) =>
    linkTo === 'reader' && v.first_doc_slug
      ? `/book/reader/${encodeURIComponent(v.slug)}/${encodeURIComponent(v.first_doc_slug)}`
      : `/book/detail/${encodeURIComponent(v.slug)}`
  // 详情页用内容宽度（避免全宽拉伸显得笨重）；阅读页侧栏窄，仍用全宽填满。
  const compact = linkTo === 'detail'
  return (
    <div className={`flex min-w-0 items-center gap-2 text-sm ${compact ? 'w-auto' : ''}`}>
      <span className="shrink-0 text-slate-400">{t('book.variant.version')}</span>
      <div className={compact ? 'w-48 max-w-full' : 'min-w-0 flex-1'}>
        <Select size="sm" value={current?.slug || ''}
          onChange={(value) => { const v = items.find((x) => x.slug === value); if (v && !v.current) router.push(hrefFor(v)) }}
          options={ordered.map((v) => ({ value: v.slug, label: v.version || v.title }))} />
      </div>
    </div>
  )
}
