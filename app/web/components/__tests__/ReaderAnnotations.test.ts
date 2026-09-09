import { describe, expect, it } from 'vitest'
import { relocateAnnotation, type ReadingAnnotation } from '../../lib/reading-annotations'

function annotation(overrides: Partial<ReadingAnnotation> = {}): ReadingAnnotation {
  return {
    id: 1, user_id: 1, book_id: 1, document_id: 1, kind: 'highlight', color: 'yellow',
    note: '', quote: 'selected text', prefix: 'before ', suffix: ' after',
    start_offset: 7, end_offset: 20, anchor_status: 'active',
    created_at: '', updated_at: '', ...overrides,
  }
}

describe('relocateAnnotation', () => {
  it('keeps a valid position active', () => {
    expect(relocateAnnotation(annotation(), 'before selected text after')).toEqual({
      start_offset: 7, end_offset: 20, anchor_status: 'active',
    })
  })

  it('relocates by quote and context after chapter edits', () => {
    expect(relocateAnnotation(annotation(), 'new intro before selected text after ending')).toEqual({
      start_offset: 17, end_offset: 30, anchor_status: 'relocated',
    })
  })

  it('retains the snapshot and marks a missing anchor orphaned', () => {
    expect(relocateAnnotation(annotation(), 'the chapter was completely rewritten')).toEqual({
      start_offset: 7, end_offset: 20, anchor_status: 'orphaned',
    })
  })
})
