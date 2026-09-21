import { useEffect, useState } from 'react'
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

// ChapterLinkPicker 让管理员直接「选书籍 → 选章节」生成阅读页地址（/book/reader/{书}/{章}），
// 免去手动复制粘贴链接；同时保留文本框，兼容手填或外部地址。
export default function ChapterLinkPicker({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [books, setBooks] = useState<BookOption[]>([])
  const [bookId, setBookId] = useState('')
  const [chapters, setChapters] = useState<{ slug: string; title: string; depth: number }[]>([])

  useEffect(() => {
    api<{ items: BookOption[] }>('/admin/books', { params: { page_size: 200, sort: 'created_at_desc' } })
      .then((r) => setBooks((r.items || []).map((b) => ({ id: b.id, title: b.title, slug: b.slug }))))
      .catch(() => { /* 无权限或空列表时保持仅文本框可用 */ })
  }, [])

  useEffect(() => {
    if (!bookId) { setChapters([]); return }
    api<DocNode[]>(`/books/${bookId}/documents`)
      .then((tree) => setChapters(flattenDocs(tree || [])))
      .catch(() => setChapters([]))
  }, [bookId])

  const book = books.find((b) => String(b.id) === bookId)
  function pickChapter(docSlug: string) {
    if (book && docSlug) onChange(`/book/reader/${book.slug}/${docSlug}`)
  }

  return (
    <div className="space-y-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select size="sm" value={bookId} onChange={setBookId}
          options={[{ value: '', label: t('admin.settings.site.pickBook') }, ...books.map((b) => ({ value: String(b.id), label: b.title }))]} />
        <Select size="sm" value="" onChange={pickChapter} disabled={!bookId}
          options={[{ value: '', label: t('admin.settings.site.pickChapter') }, ...chapters.map((c) => ({ value: c.slug, label: `${'　'.repeat(c.depth)}${c.title}` }))]} />
      </div>
    </div>
  )
}
