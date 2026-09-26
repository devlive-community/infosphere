import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { renderMarkdown } from '@/lib/markdown'

// BookOverviewCard 书籍详情页的「全书概览」（Markdown，经 XSS 净化渲染）；没有概览时不显示。
export default function BookOverviewCard({ bookId, bookSlug }: { bookId: number; bookSlug: string }) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  useEffect(() => {
    api<{ overview: { content: string } | null }>(`/chapter-guides/books/${bookId}/overview`)
      .then((d) => setContent(d.overview?.content || ''))
      .catch(() => setContent(''))
  }, [bookId])
  const html = useMemo(() => (content ? renderMarkdown(content, { bookSlug }) : ''), [content, bookSlug])
  if (!html) return null
  return (
    <div className="mt-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <i className="fa-solid fa-map text-primary-500" aria-hidden="true" />{t('chapterGuide.overview.title')}
      </h3>
      <div className="markdown-body mt-3 text-[15px]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
