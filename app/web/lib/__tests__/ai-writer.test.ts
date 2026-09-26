import { describe, expect, it } from 'vitest'
import { adoptInto, applyWriterDelta, buildRequest, locateTarget, type WriterTask } from '@/lib/ai-writer'

const content = '第一段。\n\n第二段要润色。\n\n第三段。'
const start = content.indexOf('第二段')
const end = start + '第二段要润色。'.length

describe('buildRequest', () => {
  it('处理选中的文字并附带前后文', () => {
    const r = buildRequest('polish', content, start, end)
    expect(r.text).toBe('第二段要润色。')
    expect(r.before).toBe('第一段。\n\n')
    expect(r.after).toBe('\n\n第三段。')
    expect(r.target).toEqual({ start, end, original: '第二段要润色。' })
  })

  it('续写取光标前的上文，结果接在光标处', () => {
    const r = buildRequest('continue', content, 3, 3)
    expect(r.text).toBe('第一段')
    expect(r.after).toBe('。\n\n第二段要润色。\n\n第三段。')
    expect(r.target).toEqual({ start: 3, end: 3, original: '' })
  })

  it('大纲/摘要未选中时处理整章并插到末尾', () => {
    const r = buildRequest('summary', content, 0, 0)
    expect(r.text).toBe(content)
    expect(r.target).toEqual({ start: content.length, end: content.length, original: '' })
  })

  it('去掉选区两端的空白，替换时保留段落分隔', () => {
    const r = buildRequest('polish', content, start - 2, end + 2)
    expect(r.text).toBe('第二段要润色。')
    expect(r.target).toEqual({ start, end, original: '第二段要润色。' })
  })

  it('改写类动作未选中时处理对象为空', () => {
    expect(buildRequest('rewrite', content, 2, 2).text).toBe('')
  })
})

describe('locateTarget', () => {
  const target = { start, end, original: '第二段要润色。' }

  it('原文未变化时使用原位置', () => {
    expect(locateTarget(content, target)).toEqual({ start, end })
  })

  it('生成期间前面插入了文字时按原文重新定位', () => {
    const edited = '新增的开头。\n\n' + content
    const r = locateTarget(edited, target)!
    expect(edited.slice(r.start, r.end)).toBe('第二段要润色。')
  })

  it('原文出现多处时取离原位置最近的一处', () => {
    const doubled = '第二段要润色。\n\n' + content
    const r = locateTarget(doubled, { ...target, start: start + 9, end: end + 9 })!
    expect(r.start).toBe(start + 9)
  })

  it('原文已被删改时返回 null', () => {
    expect(locateTarget(content.replace('润色', '修改'), target)).toBeNull()
  })

  it('空处理对象（续写/整章）只要位置仍在正文内即可', () => {
    expect(locateTarget(content, { start: 3, end: 3, original: '' })).toEqual({ start: 3, end: 3 })
    expect(locateTarget('短', { start: 3, end: 3, original: '' })).toBeNull()
  })
})

describe('adoptInto', () => {
  it('replace 替换处理对象并返回结果位置', () => {
    const r = adoptInto(content, { start, end }, '第二段已润色。', 'replace')
    expect(r.content).toBe('第一段。\n\n第二段已润色。\n\n第三段。')
    expect(r.content.slice(r.start, r.end)).toBe('第二段已润色。')
  })

  it('insert 作为新段落插在处理对象之后', () => {
    const r = adoptInto(content, { start, end }, '补充段。', 'insert')
    expect(r.content).toBe('第一段。\n\n第二段要润色。\n\n补充段。\n\n第三段。')
    expect(r.content.slice(r.start, r.end)).toBe('补充段。')
  })

  it('insert 到末尾时不追加多余空行', () => {
    const r = adoptInto('正文', { start: 2, end: 2 }, '摘要', 'insert')
    expect(r.content).toBe('正文\n\n摘要')
  })
})

describe('applyWriterDelta', () => {
  const task = { id: 1, result: '处理', result_seq: 2 } as WriterTask

  it('追加新片段', () => {
    expect(applyWriterDelta(task, { seq: 3, text: '后' })).toMatchObject({ result: '处理后', result_seq: 3 })
  })

  it('忽略快照已包含的片段', () => {
    expect(applyWriterDelta(task, { seq: 2, text: '重复' })).toBe(task)
  })
})
