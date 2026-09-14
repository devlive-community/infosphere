// 编辑器块级元素配置：集中定义，便于后续按模块增删/开关。
// 标题层级 H1–H6，供写作台工具栏的「标题」下拉与斜杠命令复用。

export interface HeadingLevel {
  level: number
  prefix: string // 行首 Markdown 前缀，如 '## '
  label: string
}

export const HEADING_LEVELS: HeadingLevel[] = [
  { level: 1, prefix: '# ', label: '标题 1' },
  { level: 2, prefix: '## ', label: '标题 2' },
  { level: 3, prefix: '### ', label: '标题 3' },
  { level: 4, prefix: '#### ', label: '标题 4' },
  { level: 5, prefix: '##### ', label: '标题 5' },
  { level: 6, prefix: '###### ', label: '标题 6' },
]
