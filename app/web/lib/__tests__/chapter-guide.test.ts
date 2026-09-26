import { describe, expect, it } from 'vitest'
import { applyGuide, guideState, type BookGuides, type GuideChapter, type GuideView } from '@/lib/chapter-guide'

const doc = (empty = false) => ({ id: 1, title: '缓存', slug: 'cache', status: 'published', depth: 0, empty })
const guide = (g: Partial<GuideView>): GuideView => ({ doc_id: 1, summary: '', points: [], status: '', error: '', edited: false, stale: false, input_tokens: 0, output_tokens: 0, generated_at: null, ...g })
const row = (g: Partial<GuideView> | null, empty = false): GuideChapter => ({ doc: doc(empty), guide: g ? guide(g) : null })

describe('guideState', () => {
  it('区分未生成、无正文与进行中', () => {
    expect(guideState(row(null))).toBe('none')
    expect(guideState(row(null, true))).toBe('empty')
    expect(guideState(row({ status: 'queued' }))).toBe('queued')
    expect(guideState(row({ status: 'generating', summary: '旧导读' }))).toBe('generating')
  })

  it('已生成的导读按过期、编辑区分', () => {
    expect(guideState(row({ status: 'ready', summary: '导读' }))).toBe('ready')
    expect(guideState(row({ status: 'ready', summary: '导读', stale: true, edited: true }))).toBe('stale')
    expect(guideState(row({ status: 'ready', summary: '导读', edited: true }))).toBe('edited')
    expect(guideState(row({ status: 'failed', summary: '导读', error: '额度不足' }))).toBe('failed')
  })
})

describe('applyGuide', () => {
  const data = { chapters: [row({ status: 'ready', summary: '导读' })] } as BookGuides

  it('用推送替换对应章节', () => {
    expect(applyGuide(data, guide({ status: 'generating', summary: '导读' })).chapters[0].guide?.status).toBe('generating')
  })

  it('删除后的推送（无导读无状态）清空该章', () => {
    expect(applyGuide(data, guide({})).chapters[0].guide).toBeNull()
  })
})
