export interface ReadingAnnotation {
  id: number
  user_id: number
  book_id: number
  document_id: number
  kind: 'highlight' | 'note' | 'bookmark'
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
  note: string
  quote: string
  prefix: string
  suffix: string
  start_offset: number
  end_offset: number
  anchor_status: 'active' | 'relocated' | 'orphaned'
  created_at: string
  updated_at: string
}

// 先校验原位置，再使用原文片段和前后文寻找最可信的新位置。
export function relocateAnnotation(annotation: ReadingAnnotation, text: string): Pick<ReadingAnnotation, 'start_offset' | 'end_offset' | 'anchor_status'> {
  const length = annotation.quote.length
  if (text.slice(annotation.start_offset, annotation.end_offset) === annotation.quote) {
    return {
      start_offset: annotation.start_offset,
      end_offset: annotation.end_offset,
      anchor_status: annotation.anchor_status === 'relocated' ? 'relocated' : 'active',
    }
  }
  const matches: number[] = []
  let cursor = text.indexOf(annotation.quote)
  while (cursor >= 0 && matches.length < 100) {
    matches.push(cursor)
    cursor = text.indexOf(annotation.quote, cursor + 1)
  }
  if (matches.length === 0) {
    return { start_offset: annotation.start_offset, end_offset: annotation.end_offset, anchor_status: 'orphaned' }
  }
  const best = matches.map((start) => {
    const prefix = text.slice(Math.max(0, start - annotation.prefix.length), start)
    const suffix = text.slice(start + length, start + length + annotation.suffix.length)
    let score = 0
    if (annotation.prefix && prefix.endsWith(annotation.prefix)) score += 2
    if (annotation.suffix && suffix.startsWith(annotation.suffix)) score += 2
    score -= Math.abs(start - annotation.start_offset) / Math.max(1, text.length)
    return { start, score }
  }).sort((a, b) => b.score - a.score)[0].start
  return { start_offset: best, end_offset: best + length, anchor_status: 'relocated' }
}
