import { renderMarkdown } from '@/lib/markdown'

// 书籍问答插件（qa）前端类型与工具

export interface QACitation {
  n: number
  doc_id: number
  doc_slug: string
  doc_title: string
  heading: string
  anchor: string
  snippet: string
}

export interface QAAsk {
  id: number
  book_id: number
  doc_id: number
  mode: 'rag' | 'agent'
  question: string
  selection: string
  answer: string
  steps: number
  created_at: string
  citations: QACitation[]
}

export interface QAStatus {
  ai_available: boolean
  agent_available: boolean
  vector_search: boolean
  index?: { chunks: number; embedded: number; indexed_at: string; embed_error: string }
  quota?: { used: number; limit: number } // limit = -1 表示不限
  can_reindex?: boolean
}

export interface QAUser {
  id: number
  username: string
  nickname: string
  avatar: string
}

export interface QAQuestion {
  id: number
  book_id: number
  user_id: number
  doc_id: number
  title: string
  body: string
  selection: string
  ai_answer: string
  ai_citations: QACitation[]
  accepted_answer_id: number
  answer_count: number
  status: 'open' | 'resolved'
  created_at: string
  updated_at: string
  user: QAUser
}

export interface QAAnswerItem {
  answer: { id: number; question_id: number; user_id: number; body: string; created_at: string }
  user: QAUser
  accepted: boolean
  is_author: boolean
  can_delete: boolean
}

export interface QAQuestionDetail {
  question: QAQuestion
  answers: QAAnswerItem[]
  can_accept: boolean
  can_manage: boolean
}

export const QA_PLUGIN_KEY = 'qa'

export function qaEnabled(site: { feature_plugins?: string[] } | Record<string, unknown>): boolean {
  const list = (site as { feature_plugins?: unknown }).feature_plugins
  return Array.isArray(list) && list.includes(QA_PLUGIN_KEY)
}

export function citationHref(bookSlug: string, c: Pick<QACitation, 'doc_slug' | 'anchor'>): string {
  return `/book/reader/${encodeURIComponent(bookSlug)}/${encodeURIComponent(c.doc_slug)}${c.anchor ? `#${c.anchor}` : ''}`
}

// renderAnswer 渲染 AI 回答（Markdown，经 XSS 净化），把 [n] 出处标记替换为指向阅读位置的角标链接。
export function renderAnswer(answer: string, bookSlug: string, citations: QACitation[]): string {
  const byN = new Map(citations.map((c) => [c.n, c]))
  return renderMarkdown(answer).replace(/\[(\d{1,3})\]/g, (whole, raw: string) => {
    const c = byN.get(Number(raw))
    if (!c) return whole
    return `<a href="${citationHref(bookSlug, c)}" data-qa-cite="${c.n}" class="qa-cite">${c.n}</a>`
  })
}
