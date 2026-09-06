// M17/M19 Markdown 扩展管线的回归测试：覆盖全部 14 个扩展与核心渲染器
import { describe, expect, it } from 'vitest'

import { renderMarkdown, extractHeadings } from '../markdown'

describe('renderMarkdown 基础渲染', () => {
  it('标题锚点与本章目录编号一致', () => {
    const html = renderMarkdown('## 一\n\n内容\n\n### 小节\n\n尾')
    expect(html).toContain('id="h-1"')
    expect(html).toContain('id="h-2"')
    expect(extractHeadings('## 一\n\n### 小节')).toEqual([
      { level: 2, text: '一', id: 'h-1' },
      { level: 3, text: '小节', id: 'h-2' },
    ])
  })

  it('代码块高亮并包一层容器', () => {
    const html = renderMarkdown('```ts\nconst a = 1\n```')
    expect(html).toContain('md-code-block')
    expect(html).toContain('hljs')
  })

  it('外链带 target/rel（经 DOMPurify 保留）', () => {
    const html = renderMarkdown('[首页](https://example.com)')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})

describe('M17 扩展', () => {
  it('GitHub 风格 alert', () => {
    const html = renderMarkdown('> [!WARNING]\n> 注意写法')
    expect(html).toContain('md-alert md-alert-warning')
    expect(html).toContain('警告')
  })

  it(':::tabs 多标签页', () => {
    const html = renderMarkdown(':::tabs\n=== "npm"\nnpm i\n=== "pnpm"\npnpm add\n:::')
    expect(html).toContain('data-md-tab=')
    expect(html).toContain('pnpm add')
  })

  it(':::grid 网格与列数', () => {
    const html = renderMarkdown(':::grid cols-3 gap-4\n- 快\n- 稳\n- 省\n:::')
    expect(html).toContain('grid-template-columns')
    expect(html).toContain('hover:shadow-md')
  })

  it(':::diff 行级着色', () => {
    const html = renderMarkdown(':::diff +1 -2\n- 旧行\n  新行\n- 中间\n:::')
    expect(html).toContain('bg-emerald-50')
    expect(html).toContain('bg-rose-50')
    expect(html).toContain('旧行')
  })

  it(':::katex 服务端公式渲染', () => {
    const html = renderMarkdown(':::katex\n\\int_0^1 x^2 dx\n:::')
    expect(html).toContain('katex')
  })

  it(':::mermaid 占位待客户端渲染', () => {
    const html = renderMarkdown(':::mermaid\ngraph TD; A-->B;\n:::')
    expect(html).toContain('md-mermaid')
    expect(html).toContain('graph TD')
  })

  it('!btn / !tip / !switch 内联扩展', () => {
    const html = renderMarkdown('!btn[开始](https://x.com) 与 !tip[悬停](提示语) 以及 !switch[自动](true)')
    expect(html).toContain('开始')
    expect(html).toContain('提示语')
    expect(html).toContain('translate-x-4') // 开关打开态
  })

  it(':icon{size,color}: 占位（客户端 lucide 填充）', () => {
    const html = renderMarkdown(':check{24,red}: 图标')
    expect(html).toContain('data-md-icon="check"')
  })
})

describe('M19 扩展', () => {
  it('图片：普通语法与尺寸/对齐扩展', () => {
    const html = renderMarkdown('![a](/uploads/a.png) 和 ![b](/uploads/b.png "标题" =600x center)')
    expect(html).toContain('<img src="/uploads/a.png"')
    expect(html).toContain('width:600px')
    expect(html).toContain('mx-auto')
  })

  it('对齐表格：列对齐 + 单元格行内 Markdown', () => {
    const html = renderMarkdown('| 左 | 中 | 右 |\n|:---|:---:|---:|\n| **粗** | `码` | [链](https://x.com) |')
    expect(html).toContain('text-center')
    expect(html).toContain('text-right')
    expect(html).toContain('<strong>粗</strong>')
    expect(html).toContain('<code>码</code>')
  })

  it('GitHub issue 引用：仓库前缀与默认仓库', () => {
    const html = renderMarkdown('devlive-community/infosphere#123 和 #456')
    expect(html).toContain('https://github.com/devlive-community/infosphere/issues/123')
    expect(html).toContain('https://github.com/devlive-community/infosphere/issues/456')
  })

  it(':::api REST 文档卡', () => {
    const html = renderMarkdown(':::api GET /books/:id\n获取书籍，需要 `book:read`。\n=== "参数"\n  - `id`：书籍 ID\n:::')
    expect(html).toContain('GET</span>')
    expect(html).toContain('/books/:id')
    expect(html).toContain('参数')
    expect(html).toContain('<code>book:read</code>')
  })

  it('[toc] 用标题填充目录并复用锚点 id', () => {
    const html = renderMarkdown('[toc]\n\n## 安装\n\n### 依赖')
    expect(html).not.toContain('data-md-toc') // 占位符应被目录替换
    expect(html).toContain('href="#h-1"')
    expect(html).toContain('href="#h-2"')
  })

  it('XSS 载荷被净化', () => {
    const html = renderMarkdown('[点击](javascript:alert(1)) <img src=x onerror=alert(1)>')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })
})
