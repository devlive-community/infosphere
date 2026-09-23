import { ReactNode, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Input } from '@/components/ui'

export interface BookLite { id: number; title: string; slug: string }

// BookSearchSelect 通用「可搜索书籍选择器」：输入关键字实时查后端并下拉候选，点选即回调。
// 各处（复制章节到书籍、协议/帮助章节选择、后台等）统一复用，避免各自实现固定下拉。
// endpoint/searchParam/baseParams 用于适配不同列表接口（/books 用 title 搜、/admin/books 用 q 搜）。
export default function BookSearchSelect({
  value,
  onChange,
  endpoint = '/admin/books',
  searchParam = 'q',
  baseParams,
  placeholder,
  excludeId,
  labelFor,
}: {
  value: BookLite | null
  onChange: (book: BookLite | null) => void
  endpoint?: string
  searchParam?: string
  baseParams?: Record<string, string | number | boolean>
  placeholder?: string
  excludeId?: number
  labelFor?: (book: BookLite) => ReactNode
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(value?.title || '')
  const [results, setResults] = useState<BookLite[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value?.title || '') }, [value])

  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => {
      setLoading(true)
      api<{ items: BookLite[] }>(endpoint, { params: { ...(baseParams || {}), [searchParam]: query.trim(), page_size: 20 } })
        .then((r) => setResults((r.items || []).filter((b) => b.id !== excludeId)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(h)
  }, [query, open, endpoint, searchParam, excludeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <Input value={query}
        onChange={(e) => { setQuery(e.target.value); if (value) onChange(null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || t('common.book.searchPlaceholder')} />
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-400">{t('common.book.searching')}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{t('common.book.noResult')}</div>
          ) : (
            results.map((b) => (
              <button key={b.id} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(b); setQuery(b.title); setOpen(false) }}
                className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                {labelFor ? labelFor(b) : <>{b.title} <span className="text-xs text-slate-400">/{b.slug}</span></>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
