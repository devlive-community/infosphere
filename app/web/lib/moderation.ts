import type { UserLite } from '@/components/UserSearchSelect'

/** 一处敏感词命中（字段、行列号、命中片段与上下文） */
export interface ModerationHit {
  field: string
  word: string
  category?: string
  line: number
  column: number
  text: string
  context: string
}

export type ModerationStatus = 'auto_passed' | 'pending' | 'approved' | 'rejected'

export interface ModerationCase {
  id: number
  kind: 'document' | 'book'
  target_id: number
  book_id: number
  user_id: number
  title: string
  status: ModerationStatus
  hits: ModerationHit[]
  review_note: string
  reviewed_at?: string | null
  created_at: string
  updated_at: string
}

export interface ModerationCaseItem {
  case: ModerationCase
  user?: UserLite
  book?: { id: number; title: string; slug: string }
  doc_slug?: string
}

export const MODERATION_STATUS_TONE: Record<ModerationStatus, 'slate' | 'amber' | 'emerald' | 'rose'> = {
  auto_passed: 'slate', pending: 'amber', approved: 'emerald', rejected: 'rose',
}

// caseLink 审核对象的阅读页链接（章节 → 阅读页，书籍 → 详情页）。
export function caseLink(item: ModerationCaseItem): string | undefined {
  if (!item.book) return undefined
  if (item.case.kind === 'document') return item.doc_slug ? `/book/reader/${encodeURIComponent(item.book.slug)}/${encodeURIComponent(item.doc_slug)}` : undefined
  return `/book/detail/${encodeURIComponent(item.book.slug)}`
}
