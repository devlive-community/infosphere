import { marked, type TokenizerAndRendererExtension, type Tokens, type Renderer } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'isomorphic-dompurify'
import { markdownExtensions } from './markdown-extensions'

type AlertKind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

// GitHub 风格提示块：> [!NOTE] / TIP / IMPORTANT / WARNING / CAUTION
const alertExtension: TokenizerAndRendererExtension = {
  name: 'md-alert',
  level: 'block',
  start(src: string): number | undefined {
    return src.match(/^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)?.index
  },
  tokenizer(src: string) {
    const match = /^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n([\s\S]*?)(?=\n(?:[^>\s]|\s*$)|$)/i.exec(src)
    if (match) {
      const inner = match[2].replace(/^> ?/gm, '')
      return {
        type: 'md-alert',
        raw: match[0],
        kind: match[1].toUpperCase() as AlertKind,
        tokens: this.lexer.blockTokens(inner.trim()),
      } as Tokens.Generic
    }
    return undefined
  },
  renderer(token: Tokens.Generic) {
    const titles: Record<AlertKind, string> = {
      NOTE: '备注', TIP: '提示', IMPORTANT: '重要', WARNING: '警告', CAUTION: '注意',
    }
    const kind = token.kind as AlertKind
    return `<div class="md-alert md-alert-${kind.toLowerCase()}">
      <div class="md-alert-title">${titles[kind] || kind}</div>
      <div class="md-alert-body">${this.parser.parse(token.tokens ?? [])}</div>
    </div>`
  },
}

// 章节内标题序号：为 H2/H3 生成稳定 id（h-1, h-2…），供“本章目录”锚点跳转
let headingSeq = 0

const renderer: Renderer = new marked.Renderer()

renderer.heading = (text: string, level: number): string => {
  if (level === 2 || level === 3) {
    const id = `h-${++headingSeq}`
    return `<h${level} id="${id}" class="md-h">${text}</h${level}>`
  }
  return `<h${level}>${text}</h${level}>`
}

renderer.code = (code: string, infostring: string | undefined, _escaped: boolean): string => {
  const lang = (infostring || '').match(/\S*/)?.[0] || ''
  let highlighted = ''
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch { /* fallthrough */ }
  }
  if (!highlighted) {
    try {
      highlighted = hljs.highlightAuto(code).value
    } catch {
      highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }
  return `<div class="md-code-block"><pre><code class="hljs">${highlighted}</code></pre></div>`
}

renderer.link = (href: string | null, title: string | null, text: string): string => {
  const external = /^https?:\/\//.test(href || '')
  return `<a href="${href ?? ''}"${title ? ` title="${title}"` : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`
}

marked.use({ renderer, extensions: [alertExtension, ...markdownExtensions], breaks: true, gfm: true })

// buildTocHtml 用 H2/H3 标题构建 [toc] 占位的目录内容（自身产出的安全 HTML）
function buildTocHtml(headings: Heading[]): string {
  if (!headings.length) return ''
  const items = headings
    .map((h) => {
      const text = h.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const indent = h.level === 3 ? 'pl-5' : ''
      return `<li class="${indent}"><a href="#${h.id}" class="text-slate-600 hover:text-primary-600">${text}</a></li>`
    })
    .join('')
  return (
    '<nav class="my-4 rounded-lg border border-slate-200 bg-slate-50 p-4">' +
    '<div class="mb-2 text-sm font-semibold text-slate-700">目录</div>' +
    `<ul class="space-y-1 text-sm" style="list-style:none;margin:0;padding:0">${items}</ul></nav>`
  )
}

// renderMarkdown 渲染 Markdown 为经过 XSS 净化的 HTML（SSR 与客户端共用）
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  headingSeq = 0 // 与 extractHeadings 保持相同的编号顺序
  const html = marked.parse(source, { async: false }) as string
  let out = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'id'] })
  // [toc] 扩展：用文档标题填充占位（须与 marked 解析使用同一份 source）
  if (out.includes('data-md-toc')) {
    out = out.replace(/<div[^>]*data-md-toc[^>]*>\s*<\/div>/g, buildTocHtml(extractHeadings(source)))
  }
  return out
}

export { bindMarkdownInteractivity } from './markdown-extensions'


export interface Heading {
  level: number
  text: string
  id: string
}

// extractHeadings 提取 H2/H3 目录（id 与 renderMarkdown 生成的标题 id 一致）
export function extractHeadings(source: string | null | undefined): Heading[] {
  if (!source) return []
  const headings: Heading[] = []
  let inCode = false
  let seq = 0
  source.split('\n').forEach((line) => {
    if (/^```/.test(line.trim())) inCode = !inCode
    if (inCode) return
    const m = /^(#{2,3})\s+(.+)$/.exec(line)
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), id: `h-${++seq}` })
  })
  return headings
}
