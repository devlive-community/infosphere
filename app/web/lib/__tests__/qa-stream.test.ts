import { describe, expect, it } from 'vitest'
import { applyDelta, applyReset, applyStep } from '@/lib/qa-stream'
import type { QAAsk } from '@/lib/qa'

const base = { id: 1, answer: '', trace: [], answer_seq: 0 } as unknown as QAAsk

describe('qa-stream 事件合并', () => {
  it('按序号追加回答片段，快照已包含的片段被忽略', () => {
    let ask: QAAsk = { ...base, answer: '你好', answer_seq: 2 } // 快照已含前两段
    ask = applyDelta(ask, { seq: 2, text: '重复' })
    ask = applyDelta(ask, { seq: 3, text: '，世界' })
    expect(ask.answer).toBe('你好，世界')
    expect(ask.answer_seq).toBe(3)
  })

  it('本轮以工具调用结束时清空临时文本，下一轮继续追加', () => {
    let ask = applyDelta(base, { seq: 1, text: '先查一下' })
    ask = applyReset(ask, { seq: 1 })
    expect(ask.answer).toBe('')
    ask = applyDelta(ask, { seq: 2, text: '答案' })
    expect(ask.answer).toBe('答案')
  })

  it('快照已是更新内容时忽略过期的 reset', () => {
    const ask = { ...base, answer: '第二轮', answer_seq: 5 }
    expect(applyReset(ask, { seq: 3 }).answer).toBe('第二轮')
  })

  it('调用链步骤按下标追加，重复的步骤被忽略', () => {
    const step = { type: 'model', start_ms: 0, duration_ms: 10 } as QAAsk['trace'][number]
    const one = applyStep(base, { index: 0, step, calls: 1, input_tokens: 5, output_tokens: 2, estimated: false, duration_ms: 10 })
    expect(one.trace).toHaveLength(1)
    expect(applyStep(one, { index: 0, step, calls: 1, input_tokens: 5, output_tokens: 2, estimated: false, duration_ms: 10 }).trace).toHaveLength(1)
  })
})
