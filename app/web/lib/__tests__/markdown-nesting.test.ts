import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../markdown'

// 组合/嵌套解析回归测试：块级扩展（tabs/grid/diff/katex/mermaid/api、
// <Tabs>/<Tab>、<Note>/<Tip> 等提示块）的内容均会走完整 Markdown 分词，
// 需保证围栏代码内的 :::、=== "x"、</Tabs> 等文本不被误判，同名块可嵌套。

const tabButtons = (html: string) => html.match(/role="tab"/g)?.length ?? 0

describe('markdown 组合解析', () => {
  it('Tab 内包含代码块（各 Tab 独立高亮）', () => {
    const md = [':::tabs', '=== "Node"', '```js', 'console.log(1)', '```', '=== "Go"', '```go', 'fmt.Println(1)', '```', ':::'].join('\n')
    const html = renderMarkdown(md)
    expect(html).toContain('console')
    expect(html).toContain('fmt.Println')
    expect(html.match(/md-code-block/g)?.length).toBe(2)
    expect(tabButtons(html)).toBe(2)
  })

  it('Tab 内包含 Tip 提示块（HTML 风格）', () => {
    const md = ':::tabs\n=== "A"\n<Tip>**注意**\n提示正文</Tip>\n:::'
    const html = renderMarkdown(md)
    expect(html).toContain('md-alert-tip')
    expect(html).toContain('提示正文')
  })

  it('Tab 内包含 GFM alert、grid、katex', () => {
    const md = [':::tabs', '=== "A"', '> [!NOTE]', '> 注释', '', ':::grid cols-2', '- 甲', '- 乙', ':::', '', ':::katex', 'E=mc^2', ':::', ':::'].join('\n')
    const html = renderMarkdown(md)
    expect(html).toContain('md-alert-note')
    expect(html).toContain('md-alert-body')
    expect(html).toContain('katex')
  })

  it('Tip 提示块内包含代码块', () => {
    const md = '<Note>说明文字\n\n```bash\necho hi\n```\n</Note>'
    const html = renderMarkdown(md)
    expect(html).toContain('md-alert-note')
    expect(html).toContain('md-code-block')
  })

  it('GFM alert 内包含代码块', () => {
    const md = '> [!TIP]\n> 提示\n>\n> ```js\n> let a = 1\n> ```'
    const html = renderMarkdown(md)
    expect(html).toContain('md-alert-tip')
    expect(html).toContain('md-code-block')
  })

  it('代码块中的 === "x" 行不被误判为新 Tab', () => {
    const md = ':::tabs\n=== "A"\n```txt\n=== "伪标签"\n```\n:::'
    const html = renderMarkdown(md)
    expect(html).not.toContain('伪标签</button>')
    expect(tabButtons(html)).toBe(1)
    expect(html).toContain('md-code-block')
  })

  it('代码块中的 ::: 行不终止外层块', () => {
    const md = ':::tabs\n=== "A"\n```txt\nline\n:::\nstill code\n```\n:::'
    const html = renderMarkdown(md)
    expect(tabButtons(html)).toBe(1)
    expect(html).toContain('still code')
    expect(html).not.toContain('<p>still code</p>')
  })

  it('嵌套 :::tabs', () => {
    const md = ':::tabs\n=== "外"\n:::tabs\n=== "内"\ninner\n:::\n:::'
    const html = renderMarkdown(md)
    expect(html).toContain('inner')
    // 外层 1 个按钮，内层 1 个按钮
    expect(tabButtons(html)).toBe(2)
  })

  it('嵌套 <Tabs>', () => {
    const md = '<Tabs>\n<Tab title="外">\n<Tabs>\n<Tab title="内">inner</Tab>\n</Tabs>\n</Tab>\n</Tabs>'
    const html = renderMarkdown(md)
    expect(html).toContain('inner')
    expect(tabButtons(html)).toBe(2)
  })

  it('代码块中的 </Tabs> 不终止外层 HTML 块', () => {
    const md = '<Tabs>\n<Tab title="A">\n```txt\ncode with </Tabs> inside\n```\n</Tab>\n</Tabs>'
    const html = renderMarkdown(md)
    expect(tabButtons(html)).toBe(1)
    expect(html).toContain('md-code-block')
  })

  it('整体缩进的 <Tab> 内容（迁移自其他文档系统的风格）正确解析', () => {
    // 模拟 Gogs/MDX 迁移内容：Tab 体、围栏、Tip 均带缩进，且围栏带 theme={null} 后缀
    const md = [
      '<Tabs>',
      '  <Tab title="Standard">',
      '    Add the following server block to your `Caddyfile` and reload:',
      '',
      '    ```caddy theme={null}',
      '    gogs.example.com {',
      '        reverse_proxy http://localhost:3000',
      '    }',
      '    ```',
      '',
      '    Set the matching external URL in `custom/conf/app.ini`:',
      '',
      '    ```ini theme={null}',
      '    [server]',
      '    EXTERNAL_URL = https://gogs.example.com/',
      '    ```',
      '',
      '    <Tip>',
      '      Caddy automatically provisions TLS certificates.',
      '    </Tip>',
      '  </Tab>',
      '</Tabs>',
    ].join('\n')
    const html = renderMarkdown(md)
    // 不应整体退化为缩进代码块
    expect(html).not.toContain('theme={null}')
    expect(tabButtons(html)).toBe(1)
    // 两个代码块均正常高亮
    expect(html.match(/md-code-block/g)?.length).toBe(2)
    expect(html).toContain('reverse_proxy')
    expect(html).toContain('EXTERNAL_URL')
    // Tip 提示块正常渲染
    expect(html).toContain('md-alert-tip')
    expect(html).toContain('TLS certificates')
  })

  it(':::grid 内代码块中的列表标记不切分单元格', () => {
    const md = ':::grid cols-2\n- 第一格\n\n```txt\n- 伪列表\n```\n:::'
    const html = renderMarkdown(md)
    expect(html).toContain('伪列表')
    expect(html).not.toContain('伪列表</p></div><div')
  })

  it('嵌套 :::katex 不被内层 ::: 干扰', () => {
    const md = ':::tabs\n=== "A"\n:::katex\nx^2\n:::\n:::'
    const html = renderMarkdown(md)
    expect(html).toContain('katex')
  })
})
