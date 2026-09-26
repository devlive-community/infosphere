import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'

const COLLAPSE_KEY = 'knowforge_chapter_guide_collapsed'

// ChapterGuideCard 阅读页正文上方的「本章导读」：阅读前导读与本章要点；折叠状态记在本机（仅为个人偏好）。
export default function ChapterGuideCard({ docId }: { docId: number }) {
  const { t } = useTranslation()
  const [guide, setGuide] = useState<{ summary: string; points: string[] } | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch { /* 忽略 */ }
  }, [])
  useEffect(() => {
    setGuide(null)
    api<{ guide: { summary: string; points: string[] } | null }>(`/chapter-guides/docs/${docId}`)
      .then((d) => setGuide(d.guide))
      .catch(() => setGuide(null))
  }, [docId])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* 忽略 */ }
  }

  if (!guide) return null
  return (
    <section className="mb-6 rounded-xl border border-primary-100 bg-primary-50/40 px-4 py-3" aria-label={t('chapterGuide.reader.title')}>
      <button type="button" onClick={toggle} aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-primary-700">
        <i className="fa-solid fa-compass" aria-hidden="true" />
        {t('chapterGuide.reader.title')}
        <i className={`fa-solid fa-chevron-down ml-auto text-xs transition-transform ${collapsed ? '-rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {!collapsed && (
        <div className="mt-2 text-sm leading-7 text-slate-700">
          {guide.summary.split('\n').filter(Boolean).map((p, i) => <p key={i} className="[overflow-wrap:anywhere]">{p}</p>)}
          {guide.points.length > 0 && (
            <>
              <div className="mt-3 text-xs font-semibold text-slate-500">{t('chapterGuide.reader.points')}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {guide.points.map((p, i) => <li key={i} className="[overflow-wrap:anywhere]">{p}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
