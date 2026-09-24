import Link from 'next/link'
import type { QAAsk, QATraceStep } from '@/lib/qa'
import { formatTokens } from '@/lib/ai-usage'
import { Badge, Tooltip } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

const STEP_ICON: Record<QATraceStep['type'], string> = {
  context: 'fa-quote-left', embed: 'fa-vector-square', retrieve: 'fa-magnifying-glass', model: 'fa-microchip', tool: 'fa-screwdriver-wrench',
}

function secs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

// QATrace 一次问答的完整调用链：划词上下文、向量化查询、检索命中、每次模型调用（模型、tokens、耗时、请求的工具）与每次工具执行
export default function QATrace({ ask }: { ask: QAAsk }) {
  const { t } = useTranslation()
  const steps = ask.trace || []
  const modelCalls = steps.filter((s) => s.type === 'model').length
  const tokens = ask.input_tokens + ask.output_tokens
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500">
        <span>{t('qa.trace.summary', { calls: modelCalls, steps: steps.length })}</span>
        <span>{t(ask.estimated ? 'qa.trace.tokensEstimated' : 'qa.trace.tokens', { input: formatTokens(ask.input_tokens), output: formatTokens(ask.output_tokens), total: formatTokens(tokens) })}</span>
        <span>{t('qa.trace.duration', { time: secs(ask.duration_ms) })}</span>
        {ask.trace_id && <Link href={`/user/ai-usage?trace=${encodeURIComponent(ask.trace_id)}`} className="ml-auto font-medium text-primary-600 hover:text-primary-700">{t('qa.trace.viewUsage')}</Link>}
      </div>
      {steps.length === 0 ? <p className="mt-2 text-slate-400">{t('qa.trace.empty')}</p> : (
        <ol className="mt-2 space-y-1.5">
          {steps.map((s, i) => <TraceRow key={i} index={i + 1} step={s} />)}
        </ol>
      )}
    </div>
  )
}

function TraceRow({ index, step: s }: { index: number; step: QATraceStep }) {
  const { t } = useTranslation()
  const noteKey = s.note ? `qa.trace.note.${s.note}` : ''
  const note = noteKey && t(noteKey) !== noteKey ? t(noteKey) : ''
  return (
    <li className="flex gap-2 rounded-md bg-white px-2.5 py-2 ring-1 ring-slate-100">
      <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">{index}</span>
      <i className={`fa-solid ${STEP_ICON[s.type]} mt-0.5 w-4 shrink-0 text-center ${s.error ? 'text-rose-500' : 'text-primary-500'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-slate-700">{s.type === 'tool' ? t('qa.trace.tool', { name: s.name || '' }) : s.type === 'context' && !s.query ? t('qa.trace.type.contextChapter') : t(`qa.trace.type.${s.type}`)}</span>
          {s.model && <span className="text-slate-400">{s.model}</span>}
          {s.mode && <Badge tone={s.mode === 'hybrid' ? 'emerald' : 'slate'}>{t(s.mode === 'hybrid' ? 'qa.ask.hybridSearch' : 'qa.ask.keywordSearch')}</Badge>}
          {(s.input_tokens || s.output_tokens) ? (
            <Tooltip content={s.estimated ? t('qa.trace.estimatedHint') : t('qa.trace.tokensHint')}>
              <span className="tabular-nums text-slate-500">{s.estimated ? '≈' : ''}{formatTokens(s.input_tokens)} / {formatTokens(s.output_tokens)} tokens</span>
            </Tooltip>
          ) : null}
          <span className="ml-auto tabular-nums text-slate-400">{t('qa.trace.at', { at: secs(s.start_ms), took: secs(s.duration_ms) })}</span>
        </div>
        {s.query && <div className="break-words text-slate-500">{t('qa.trace.query', { query: s.query })}</div>}
        {s.args && s.type === 'tool' && !s.query && <div className="break-all font-mono text-[11px] text-slate-400">{s.args}</div>}
        {s.tool_calls && s.tool_calls.length > 0 && (
          <div className="text-slate-500">{t('qa.trace.requested')}{' '}
            {s.tool_calls.map((c, i) => <code key={i} className="mr-1 break-all rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-600">{c.name}({c.args})</code>)}
          </div>
        )}
        {s.output && <div className="break-words italic text-slate-400">{s.output}</div>}
        {s.hits && s.hits.length > 0 && (
          <ul className="space-y-0.5">
            {s.hits.map((h) => (
              <li key={h.n} className="flex gap-1.5 text-slate-600"><span className="qa-cite shrink-0">{h.n}</span><span className="min-w-0 truncate">{h.doc_title}{h.heading ? ` › ${h.heading}` : ''}</span></li>
            ))}
          </ul>
        )}
        {(s.type === 'retrieve' || (s.type === 'tool' && s.name === 'search_book')) && (!s.hits || s.hits.length === 0) && <div className="text-slate-400">{t('qa.trace.noHits')}</div>}
        {note && <div className="text-amber-600">{note}</div>}
        {s.error && <div className="text-rose-600">{s.error}</div>}
      </div>
    </li>
  )
}
