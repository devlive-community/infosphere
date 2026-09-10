import { describe, expect, it } from 'vitest'
import { fitContextMenuPosition } from '../ContextMenu'

describe('fitContextMenuPosition', () => {
  it('keeps a context menu beside the pointer when space is available', () => {
    expect(fitContextMenuPosition(
      { x: 80, y: 60 },
      { width: 160, height: 120 },
      { width: 600, height: 400 },
    )).toEqual({ x: 80, y: 60 })
  })

  it('opens inward near the bottom-right viewport edge', () => {
    expect(fitContextMenuPosition(
      { x: 590, y: 390 },
      { width: 160, height: 120 },
      { width: 600, height: 400 },
    )).toEqual({ x: 430, y: 270 })
  })

  it('clamps oversized edge coordinates to the viewport gap', () => {
    expect(fitContextMenuPosition(
      { x: 2, y: 3 },
      { width: 160, height: 120 },
      { width: 600, height: 400 },
    )).toEqual({ x: 8, y: 8 })
  })

  it('aligns a trigger menu to the anchor end edge', () => {
    expect(fitContextMenuPosition(
      { x: 280, y: 100 },
      { width: 160, height: 120 },
      { width: 600, height: 400 },
      8,
      'end',
    )).toEqual({ x: 120, y: 100 })
  })

  it('uses the trigger top edge when a button menu opens upward', () => {
    expect(fitContextMenuPosition(
      { x: 280, y: 394 },
      { width: 160, height: 120 },
      { width: 600, height: 400 },
      8,
      'end',
      354,
    )).toEqual({ x: 120, y: 234 })
  })
})
