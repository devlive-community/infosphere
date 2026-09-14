// 行级文本差异（LCS），用于版本历史的 git diff 式对比。
// 仅在前端计算，避免后端改动；超大文本时降级为整体替换，保证响应性。

export type DiffRowType = 'context' | 'add' | 'del'

export interface DiffRow {
  type: DiffRowType
  text: string
  oldNo?: number // 旧文本中的行号（context / del）
  newNo?: number // 新文本中的行号（context / add）
}

export interface DiffStats {
  added: number
  removed: number
}

// LCS 表规模上限（行数乘积）。超过则不做精细对齐，降级为“整段删除 + 整段新增”。
const MAX_CELLS = 4_000_000

function splitLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n?/g, '\n').split('\n')
}

// diffLines 计算从 oldText 到 newText 的逐行差异。
export function diffLines(oldText: string, newText: string): DiffRow[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  const n = a.length
  const m = b.length

  if (n === 0 && m === 0) return []

  if (n * m > MAX_CELLS) {
    const rows: DiffRow[] = []
    a.forEach((text, i) => rows.push({ type: 'del', text, oldNo: i + 1 }))
    b.forEach((text, i) => rows.push({ type: 'add', text, newNo: i + 1 }))
    return rows
  }

  // dp[i][j] = a[i:] 与 b[j:] 的最长公共子序列长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'context', text: a[i], oldNo: oldNo++, newNo: newNo++ })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: a[i], oldNo: oldNo++ })
      i++
    } else {
      rows.push({ type: 'add', text: b[j], newNo: newNo++ })
      j++
    }
  }
  while (i < n) rows.push({ type: 'del', text: a[i++], oldNo: oldNo++ })
  while (j < m) rows.push({ type: 'add', text: b[j++], newNo: newNo++ })
  return rows
}

export function diffStats(rows: DiffRow[]): DiffStats {
  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.type === 'add') added++
    else if (row.type === 'del') removed++
  }
  return { added, removed }
}
