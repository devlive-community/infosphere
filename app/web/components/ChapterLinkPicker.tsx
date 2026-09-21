import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Input, Select } from '@/components/ui'

interface BookOption { id: number; title: string; slug: string }
interface DocNode { slug: string; title: string; external_url?: string; children?: DocNode[] }

// flattenDocs 把章节树压平为带缩进层级的可选项（跳过外链章节：作为协议/帮助页需内部可读章节）。
function flattenDocs(nodes: DocNode[], depth = 0, out: { slug: string; title: string; depth: number }[] = []) {
  for (const n of nodes) {
    if (!(n.external_url || '').trim()) out.push({ slug: n.slug, title: n.title, depth })
    if (n.children?.length) flattenDocs(n.children, depth + 1, out)
  }
  return out
}

// ChapterLinkPicker 让管理员直接「搜索书籍 → 选章节」生成阅读页地址（/book/reader/{书}/{章}），
// 免去手动复制粘贴链接；同时保留文本框，兼容手填或外部地址。
// 书籍用可搜索下拉（实时查 /admin/books?q=），书多时也能搜到，不再受固定条数限制。
export default function ChapterLinkPicker({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<BookOption | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [chapters, setChapters] = useState<{ slug: string; title: string; depth: number }[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  // 搜索书籍（防抖 250ms）：下拉打开时按关键字查，关键字为空则取最近的书。
  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => {
      setLoading(true)
      api<{ items: BookOption[] }>('/admin/books', { params: { q: query.trim(), page_size: 20, sort: 'created_at_desc' } })
        .then((r) => setResults((r.items || []).map((b) => ({ id: b.id, title: b.title, slug: b.slug }))))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(h)
  }, [query, open])

  // 选中书籍后加载其章节
  useEffect(() => {
    if (!selected) { setChapters([]); return }
    api<DocNode[]>(`/books/${selected.id}/documents`)
      .then((tree) => setChapters(flattenDocs(tree || [])))
      .catch(() => setChapters([]))
  }, [selected])

  // 点击组件外部关闭下拉
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function selectBook(b: BookOption) {
    setSelected(b)
    setQuery(b.title)
    setOpen(false)
  }
  function pickChapter(docSlug: string) {
    if (selected && docSlug) onChange(`/book/reader/${selected.slug}/${docSlug}`)
  }

  return (
    <div className="space-y-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div ref={boxRef} className="relative sm:w-1/2">
          <Input size="sm" value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={t('admin.settings.site.searchBook')} />
          {open && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {loading ? (
                <div className="px-3 py-2 text-sm text-slate-400">{t('admin.settings.site.searching')}</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">{t('admin.settings.site.noBookFound')}</div>
              ) : (
                results.map((b) => (
                  <button key={b.id} type="button" onClick={() => selectBook(b)}
                    className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                    {b.title} <span className="text-xs text-slate-400">/{b.slug}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="sm:w-1/2">
          <Select size="sm" value="" onChange={pickChapter} disabled={!selected}
            options={[{ value: '', label: t('admin.settings.site.pickChapter') }, ...chapters.map((c) => ({ value: c.slug, label: `${'　'.repeat(c.depth)}${c.title}` }))]} />
        </div>
      </div>
    </div>
  )
}
