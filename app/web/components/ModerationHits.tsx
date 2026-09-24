import { useTranslation } from '@/lib/i18n'
import type { ModerationHit } from '@/lib/moderation'

// ModerationHits 敏感词命中列表：字段 · 第 N 行第 M 列，上下文中高亮命中片段。
export default function ModerationHits({ hits }: { hits: ModerationHit[] }) {
  const { t } = useTranslation()
  if (hits.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {hits.map((h, i) => {
        const at = h.context.indexOf(h.text)
        return (
          <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5">
            <div className="text-slate-500">
              {t(`moderation.field.${h.field}`)} · {t('moderation.position', { line: h.line, column: h.column })} · <span className="font-medium text-rose-600">{h.word}</span>
              {h.category && <span className="ml-1 text-slate-400">（{h.category}）</span>}
            </div>
            <div className="mt-0.5 [overflow-wrap:anywhere] text-slate-700">
              {at >= 0 ? <>{h.context.slice(0, at)}<mark className="rounded bg-rose-100 px-0.5 text-rose-700">{h.text}</mark>{h.context.slice(at + h.text.length)}</> : h.context}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
