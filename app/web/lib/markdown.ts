import { marked, type TokenizerAndRendererExtension, type Tokens, type Renderer } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'isomorphic-dompurify'

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

const renderer: Renderer = new marked.Renderer()

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

marked.use({ renderer, extensions: [alertExtension], breaks: true, gfm: true })

// renderMarkdown 渲染 Markdown 为经过 XSS 净化的 HTML（仅客户端使用）
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  const html = marked.parse(source, { async: false }) as string
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] })
}

export interface Heading {
  level: number
  text: string
}

// extractHeadings 提取 H2/H3 目录
export function extractHeadings(source: string | null | undefined): Heading[] {
  if (!source) return []
  const headings: Heading[] = []
  let inCode = false
  source.split('\n').forEach((line) => {
    if (/^```/.test(line.trim())) inCode = !inCode
    if (inCode) return
    const m = /^(#{2,3})\s+(.+)$/.exec(line)
    if (m) headings.push({ level: m[1].length, text: m[2].trim() })
  })
  return headings
}
