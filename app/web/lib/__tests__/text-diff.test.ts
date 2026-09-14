// 行级差异（版本历史 git diff 视图）回归测试
import { describe, expect, it } from 'vitest'

import { diffLines, diffStats } from '../text-diff'

describe('diffLines 行级差异', () => {
  it('相同内容全部为 context，无增删', () => {
    const rows = diffLines('a\nb\nc', 'a\nb\nc')
    expect(rows.every((r) => r.type === 'context')).toBe(true)
    expect(diffStats(rows)).toEqual({ added: 0, removed: 0 })
  })

  it('中间一行改动记为一删一增，保留上下文', () => {
    const rows = diffLines('a\nb\nc', 'a\nB\nc')
    expect(rows.map((r) => `${r.type}:${r.text}`)).toEqual([
      'context:a', 'del:b', 'add:B', 'context:c',
    ])
    expect(diffStats(rows)).toEqual({ added: 1, removed: 1 })
  })

  it('保留旧/新行号', () => {
    const rows = diffLines('a\nb', 'a\nb\nc')
    const added = rows.find((r) => r.type === 'add')
    expect(added).toMatchObject({ text: 'c', newNo: 3 })
    expect(rows[0]).toMatchObject({ type: 'context', oldNo: 1, newNo: 1 })
  })

  it('纯新增与纯删除', () => {
    expect(diffStats(diffLines('', 'x\ny'))).toEqual({ added: 2, removed: 0 })
    expect(diffStats(diffLines('x\ny', ''))).toEqual({ added: 0, removed: 2 })
  })

  it('CRLF 归一化后不产生虚假差异', () => {
    const rows = diffLines('a\r\nb', 'a\nb')
    expect(diffStats(rows)).toEqual({ added: 0, removed: 0 })
  })
})
