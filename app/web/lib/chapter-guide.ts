import { useEffect, useRef } from 'react'
import { openTicketedStream } from '@/lib/event-stream'

// 章节导读插件（chapter-guide）：阅读前导读与本章要点、全书概览。作者管理页经 SSE 接收本书导读状态变化（guide / overview 事件）。

export const CHAPTER_GUIDE_PLUGIN_KEY = 'chapter-guide'

export function chapterGuideEnabled(site: { feature_plugins?: string[] } | Record<string, unknown>): boolean {
  const list = (site as { feature_plugins?: unknown }).feature_plugins
  return Array.isArray(list) && list.includes(CHAPTER_GUIDE_PLUGIN_KEY)
}

export type GuideStatus = '' | 'queued' | 'generating' | 'ready' | 'failed' | 'skipped'

export interface GuideView {
  doc_id: number
  summary: string
  points: string[]
  status: GuideStatus
  error: string
  edited: boolean
  stale: boolean
  input_tokens: number
  output_tokens: number
  generated_at: string | null
}

export interface OverviewView {
  content: string
  status: GuideStatus
  error: string
  edited: boolean
  stale: boolean
  input_tokens: number
  output_tokens: number
  generated_at: string | null
}

export interface GuideChapter {
  doc: { id: number; title: string; slug: string; status: string; depth: number; empty: boolean }
  guide: GuideView | null
}

export interface BookGuides {
  available: boolean
  auto_generate: boolean
  cost_bearer: 'author' | 'site'
  quota: { limit: number; used: number }
  chapters: GuideChapter[]
  overview: OverviewView | null
}

// 管理页展示的状态（含「过期」「已编辑」「无正文」等派生状态）。
export type GuideState = 'none' | 'empty' | 'queued' | 'generating' | 'ready' | 'stale' | 'edited' | 'failed'

export function guideState(row: GuideChapter): GuideState {
  const g = row.guide
  if (row.doc.empty && (!g || !g.summary)) return 'empty'
  if (!g || (!g.summary && !g.status)) return 'none'
  if (g.status === 'queued' || g.status === 'generating' || g.status === 'failed') return g.status
  if (!g.summary) return 'none'
  if (g.stale) return 'stale'
  return g.edited ? 'edited' : 'ready'
}

// applyGuide 用推送的导读替换对应章节（summary 为空且无状态表示已删除）。
export function applyGuide(data: BookGuides, g: GuideView): BookGuides {
  const guide = !g.summary && !g.status ? null : g
  return { ...data, chapters: data.chapters.map((c) => (c.doc.id === g.doc_id ? { ...c, guide } : c)) }
}

// useBookGuidesStream 管理页打开期间订阅本书导读与概览的状态变化。
export function useBookGuidesStream(bookId: number, enabled: boolean, onGuide: (g: GuideView) => void, onOverview: (o: OverviewView | null) => void) {
  const guideRef = useRef(onGuide)
  const overviewRef = useRef(onOverview)
  guideRef.current = onGuide
  overviewRef.current = onOverview
  useEffect(() => {
    if (!enabled) return
    return openTicketedStream(`/chapter-guides/books/${bookId}/stream`, (source) => {
      source.addEventListener('guide', (e) => {
        try { guideRef.current(JSON.parse((e as MessageEvent).data) as GuideView) } catch { /* 忽略 */ }
      })
      source.addEventListener('overview', (e) => {
        try { overviewRef.current(JSON.parse((e as MessageEvent).data) as OverviewView | null) } catch { /* 忽略 */ }
      })
    })
  }, [bookId, enabled])
}
