import { describe, expect, it } from 'vitest'
import { controlHeight, sizedControlStyle } from '../controlSize'

describe('shared control sizing', () => {
  it('maps every component size to the shared theme height variables', () => {
    expect(controlHeight).toEqual({
      sm: 'var(--control-height-sm)',
      md: 'var(--control-height)',
      lg: 'var(--control-height-lg)',
    })
  })

  it('does not allow page-level styles to override the selected control height', () => {
    expect(sizedControlStyle('sm', { width: 120, height: 99 })).toEqual({
      width: 120,
      height: 'var(--control-height-sm)',
    })
  })
})
