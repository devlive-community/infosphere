import { useEffect, useRef } from 'react'
import { API_BASE, getToken } from '@/lib/api'
import type { QAAsk, QATraceStep } from '@/lib/qa'

// 进行中问答的实时进度（SSE）：服务端先推 snapshot，之后逐步推 step，结束推 done。
// 连接断开时 EventSource 自动重连并重新获得 snapshot；step 按 index 去重，保证不重复、不遗漏。

interface StepEvent {
  index: number
  step: QATraceStep
  calls: number
  input_tokens: number
  output_tokens: number
  estimated: boolean
  duration_ms: number
}

// applyStep 把一个 step 事件合并进问答记录（已包含的步骤忽略）。
export function applyStep(ask: QAAsk, ev: StepEvent): QAAsk {
  if (ev.index !== ask.trace.length) return ask
  return {
    ...ask, trace: [...ask.trace, ev.step], calls: ev.calls, input_tokens: ev.input_tokens,
    output_tokens: ev.output_tokens, estimated: ev.estimated, duration_ms: ev.duration_ms,
  }
}

// useAskStreams 为列表中每条进行中的问答订阅进度；update 用最新记录替换（或按函数更新）列表项，onFinish 在某条结束时调用。
export function useAskStreams(
  asks: QAAsk[],
  update: (id: number, next: (ask: QAAsk) => QAAsk) => void,
  onFinish?: (ask: QAAsk) => void,
) {
  const updateRef = useRef(update)
  const finishRef = useRef(onFinish)
  updateRef.current = update
  finishRef.current = onFinish
  const runningKey = asks.filter((a) => a.status === 'running').map((a) => a.id).join(',')

  useEffect(() => {
    const token = getToken()
    if (!runningKey || !token) return
    const sources = runningKey.split(',').map(Number).map((id) => {
      const source = new EventSource(`${API_BASE}/api/v1/qa/asks/${id}/stream?token=${encodeURIComponent(token)}`)
      const parse = <T,>(e: MessageEvent): T | null => {
        try { return JSON.parse(e.data) as T } catch { return null }
      }
      source.addEventListener('snapshot', (e) => {
        const ask = parse<QAAsk>(e as MessageEvent)
        if (ask) updateRef.current(id, () => ask)
      })
      source.addEventListener('step', (e) => {
        const ev = parse<StepEvent>(e as MessageEvent)
        if (ev) updateRef.current(id, (ask) => applyStep(ask, ev))
      })
      source.addEventListener('done', (e) => {
        source.close() // 结束后关闭，避免 EventSource 自动重连
        const ask = parse<QAAsk>(e as MessageEvent)
        if (ask) {
          updateRef.current(id, () => ask)
          finishRef.current?.(ask)
        }
      })
      return source
    })
    return () => sources.forEach((s) => s.close())
  }, [runningKey])
}
