// M17: InfoSphere 旧版 marked 扩展语法的 TS 移植。
// 语法与旧版 backend/lib/extension/marked 保持兼容，输出改为纯 Tailwind 工具类 + data-* 钩子：
//   :::tabs / === "标题"        多标签页（点击切换，见 bindMarkdownInteractivity）
//   :::grid cols-3 gap-4        网格卡片（列表项分格）
//   :::diff +1 -2,4-6           行级 diff（支持行号标记与 +/- 前缀）
//   :::katex                    数学公式（服务端 katex 渲染）
//   :::mermaid                  流程图（客户端动态渲染）
//   [toc]                       章节目录占位（renderMarkdown 用标题填充）
//   !btn[文本](链接){类名}       内联按钮
//   !tip[文本](提示)            内联悬浮提示（纯 CSS）
//   !switch[文本](状态)         内联开关（静态展示）
//   :icon-name{size,color}:     内联图标（客户端 lucide 填充）
import type { TokenizerAndRendererExtension, Tokens } from 'marked'
import katex from 'katex'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// inInlineCode 旧版规则：占位起始位置之前的反引号数量为奇数时视为处于行内代码中
function inInlineCode(src: string, index: number): boolean {
  const backticks = src.slice(0, index).match(/`/g)
  return !!backticks && backticks.length % 2 === 1
}

// ── :::tabs ──────────────────────────────────────────────────────────────

interface MdTab {
  title: string
  tokens: Tokens.Generic[]
}

const tabsExtension: TokenizerAndRendererExtension = {
  name: 'md-tabs',
  level: 'block',
  start(src) {
    return src.match(/^:::\s*tabs\s*\n/)?.index
  },
  tokenizer(src) {
    const header = /^:::\s*tabs\s*\n/.exec(src)
    if (!header) return undefined
    const end = src.indexOf('\n:::')
    if (end === -1) return undefined
    const content = src.slice(header[0].length, end)
    const raw = src.slice(0, end + 4)

    const tabs: { title: string; src: string }[] = []
    let current: { title: string; src: string } | null = null
    for (const line of content.split('\n')) {
      const m = /^===\s*"([^"]+)"\s*$/.exec(line.trim())
      if (m) {
        current = { title: m[1], src: '' }
        tabs.push(current)
        continue
      }
      if (current) current.src += line + '\n'
    }
    if (tabs.length === 0) return undefined
    return {
      type: 'md-tabs',
      raw,
      tabs: tabs.map((t) => ({ title: t.title, tokens: this.lexer.blockTokens(t.src) })),
    } as Tokens.Generic
  },
  renderer(token) {
    const gid = `md-tabs-${Math.random().toString(36).slice(2, 9)}`
    const tabs = (token as Tokens.Generic & { tabs: MdTab[] }).tabs
    const buttons = tabs
      .map(
        (t, i) =>
          `<button type="button" data-md-tab="${gid}" data-md-tab-index="${i}" role="tab" aria-selected="${i === 0}"` +
          ` class="px-4 py-2 text-sm font-medium border-b-2 transition-colors focus:outline-none` +
          (i === 0 ? ' border-primary-500 text-primary-600' : ' border-transparent text-slate-500 hover:text-slate-700') +
          `">${escapeHtml(t.title)}</button>`
      )
      .join('')
    const panels = tabs
      .map(
        (t, i) =>
          `<div data-md-tab-panel="${gid}" data-md-tab-index="${i}" role="tabpanel"` +
          ` class="pt-4 ${i === 0 ? '' : 'hidden'}">${this.parser.parse(t.tokens)}</div>`
      )
      .join('')
    return `<div class="my-4"><div class="flex flex-wrap gap-1 border-b border-slate-200">${buttons}</div>${panels}</div>`
  },
}

// ── :::grid ──────────────────────────────────────────────────────────────

const gridExtension: TokenizerAndRendererExtension = {
  name: 'md-grid',
  level: 'block',
  start(src) {
    return src.match(/^:::\s*grid(?:\s+[\w-]+)*\s*\n/)?.index
  },
  tokenizer(src) {
    const header = /^:::\s*grid((?:\s+[\w-]+)*)\s*\n/.exec(src)
    if (!header) return undefined
    const end = src.indexOf('\n:::')
    if (end === -1) return undefined
    const content = src.slice(header[0].length, end)
    const raw = src.slice(0, end + 4)

    let cols = 2
    let gap = 4
    let responsive = true
    for (const opt of header[1].trim().split(/\s+/).filter(Boolean)) {
      if (opt.startsWith('cols-')) cols = Math.min(Math.max(parseInt(opt.slice(5), 10) || 2, 1), 6)
      else if (opt.startsWith('gap-')) gap = Math.min(Math.max(parseInt(opt.slice(4), 10) || 4, 0), 12)
      else if (opt === 'no-responsive') responsive = false
    }

    // 列表项切分：列表标记开新格，缩进续行并入当前格
    const items: string[] = []
    let currentItem: string[] = []
    let collecting = false
    for (const line of content.split('\n')) {
      const marker = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
      if (marker) {
        if (collecting) items.push(currentItem.join('\n').trim())
        currentItem = [marker[3]]
        collecting = true
        continue
      }
      if (collecting) currentItem.push(line)
    }
    if (collecting) items.push(currentItem.join('\n').trim())
    if (items.length === 0) return undefined
    return {
      type: 'md-grid',
      raw,
      items: items.map((item) => ({ tokens: this.lexer.blockTokens(item) })),
      cols,
      gap,
      responsive,
    } as Tokens.Generic
  },
  renderer(token) {
    const t = token as Tokens.Generic & { items: { tokens: Tokens.Generic[] }[]; cols: number; gap: number; responsive: boolean }
    const cells = t.items
      .map(
        (item) =>
          `<div class="p-4 border border-slate-200 bg-white rounded-lg transition-shadow duration-200 hover:shadow-md">` +
          `${this.parser.parse(item.tokens)}</div>`
      )
      .join('')
    const columns = t.responsive
      ? `repeat(auto-fit, minmax(min(100%, ${Math.floor(100 / t.cols)}%), 1fr))`
      : `repeat(${t.cols}, minmax(0, 1fr))`
    return `<div class="my-4 w-full grid" style="gap:${(t.gap * 0.25).toFixed(2)}rem;grid-template-columns:${columns}">${cells}</div>`
  },
}

// ── :::diff ──────────────────────────────────────────────────────────────

const diffExtension: TokenizerAndRendererExtension = {
  name: 'md-diff',
  level: 'block',
  start(src) {
    return src.match(/^:::\s*diff(?:\s+[+-][\d,-]+)*\s*\n/)?.index
  },
  tokenizer(src) {
    const header = /^:::\s*diff((?:\s+[+-][\d,-]+)*)\s*\n/.exec(src)
    if (!header) return undefined
    const end = src.indexOf('\n:::')
    if (end === -1) return undefined
    const content = src.slice(header[0].length, end)
    const raw = src.slice(0, end + 4)

    const addLines = new Set<number>()
    const deleteLines = new Set<number>()
    for (const opt of header[1].trim().split(/\s+/).filter(Boolean)) {
      const type = opt[0]
      if (type !== '+' && type !== '-') continue
      for (const range of opt.slice(1).split(',')) {
        if (range.includes('-')) {
          const [start, stop] = range.split('-').map(Number)
          if (!Number.isNaN(start) && !Number.isNaN(stop)) {
            for (let i = start; i <= stop; i++) (type === '+' ? addLines : deleteLines).add(i)
          }
        } else {
          const num = Number(range)
          if (!Number.isNaN(num)) (type === '+' ? addLines : deleteLines).add(num)
        }
      }
    }
    const lines = content.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    return {
      type: 'md-diff',
      raw,
      lines: lines.map((line, index) => {
        const lineNo = index + 1
        let type = 'context'
        if (addLines.has(lineNo)) type = 'addition'
        else if (deleteLines.has(lineNo)) type = 'deletion'
        else if (line.startsWith('+')) type = 'addition'
        else if (line.startsWith('-')) type = 'deletion'
        return { type, text: type === 'context' ? line : line.slice(1) }
      }),
    } as Tokens.Generic
  },
  renderer(token) {
    const t = token as Tokens.Generic & { lines: { type: string; text: string }[] }
    const rows = t.lines
      .map((line) => {
        const prefix = line.type === 'addition' ? '+' : line.type === 'deletion' ? '−' : ' '
        const bg = line.type === 'addition' ? 'bg-emerald-50' : line.type === 'deletion' ? 'bg-rose-50' : ''
        const fg = line.type === 'addition' ? 'text-emerald-600' : line.type === 'deletion' ? 'text-rose-600' : 'text-slate-400'
        return (
          `<div class="flex px-2 py-0.5 ${bg}">` +
          `<span class="w-4 shrink-0 select-none font-mono ${fg}">${prefix}</span>` +
          `<span class="flex-1 ml-1 font-mono whitespace-pre-wrap">${escapeHtml(line.text)}</span></div>`
        )
      })
      .join('')
    return `<div class="my-4 block w-full bg-slate-50 border border-slate-200 rounded-lg overflow-hidden"><div class="overflow-x-auto"><pre class="min-w-full w-max py-2"><code>${rows}</code></pre></div></div>`
  },
}

// ── :::katex / :::mermaid ────────────────────────────────────────────────

const katexExtension: TokenizerAndRendererExtension = {
  name: 'md-katex',
  level: 'block',
  start(src) {
    return src.match(/^:::\s*katex\n/)?.index
  },
  tokenizer(src) {
    const header = /^:::\s*katex\n/.exec(src)
    if (!header) return undefined
    const end = src.indexOf('\n:::')
    if (end === -1) return undefined
    const content = src.slice(header[0].length, end).trim()
    return { type: 'md-katex', raw: src.slice(0, end + 4), content } as Tokens.Generic
  },
  renderer(token) {
    const content = (token as Tokens.Generic & { content: string }).content
    let html: string
    try {
      html = katex.renderToString(content, { displayMode: true, throwOnError: false })
    } catch {
      html = `<code class="text-rose-600">${escapeHtml(content)}</code>`
    }
    return `<div class="my-4 overflow-x-auto">${html}</div>`
  },
}

const mermaidExtension: TokenizerAndRendererExtension = {
  name: 'md-mermaid',
  level: 'block',
  start(src) {
    return src.match(/^:::\s*mermaid\n/)?.index
  },
  tokenizer(src) {
    const header = /^:::\s*mermaid\n/.exec(src)
    if (!header) return undefined
    const end = src.indexOf('\n:::')
    if (end === -1) return undefined
    const content = src.slice(header[0].length, end).trim()
    return { type: 'md-mermaid', raw: src.slice(0, end + 4), content } as Tokens.Generic
  },
  renderer(token) {
    const content = escapeHtml((token as Tokens.Generic & { content: string }).content)
    return `<div class="md-mermaid my-4 flex justify-center overflow-x-auto rounded-lg border border-slate-200 bg-white p-4"><pre class="text-sm text-slate-600">${content}</pre></div>`
  },
}

// ── [toc] ────────────────────────────────────────────────────────────────

const tocExtension: TokenizerAndRendererExtension = {
  name: 'md-toc',
  level: 'block',
  start(src) {
    return src.match(/^\[toc\]\s*$/im)?.index
  },
  tokenizer(src) {
    const m = /^\[toc\]\s*\n?/i.exec(src)
    if (!m) return undefined
    return { type: 'md-toc', raw: m[0] } as Tokens.Generic
  },
  renderer() {
    return '<div data-md-toc="1" class="my-4"></div>'
  },
}

// ── 内联扩展 ─────────────────────────────────────────────────────────────

const buttonExtension: TokenizerAndRendererExtension = {
  name: 'md-button',
  level: 'inline',
  start(src) {
    const index = src.indexOf('!btn[')
    if (index === -1 || inInlineCode(src, index)) return undefined
    return index
  },
  tokenizer(src) {
    const rule = /^!btn\[(.*?)\](?:\((.*?)\))?(?:\{(.*?)\})?/
    const match = rule.exec(src)
    if (!match || inInlineCode(src, match.index)) return undefined
    return {
      type: 'md-button',
      raw: match[0],
      text: match[1],
      link: match[2] || '',
      className: match[3] || '',
      tokens: [],
    } as Tokens.Generic
  },
  renderer(token) {
    const t = token as Tokens.Generic & { text: string; link: string; className: string }
    const base = 'inline-flex items-center justify-center px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors'
    const style = t.className || 'bg-primary-600 text-white hover:bg-primary-700'
    if (!t.link) {
      return `<button type="button" class="${base} ${style}"><span class="inline-flex items-center">${escapeHtml(t.text)}</span></button>`
    }
    const external = /^https?:\/\//.test(t.link)
    const rel = external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${escapeHtml(t.link)}"${rel} class="${base} ${style}"><span class="inline-flex items-center">${escapeHtml(t.text)}</span></a>`
  },
}

const tipExtension: TokenizerAndRendererExtension = {
  name: 'md-tip',
  level: 'inline',
  start(src) {
    const index = src.indexOf('!tip[')
    if (index === -1 || inInlineCode(src, index)) return undefined
    return index
  },
  tokenizer(src) {
    const match = /^!tip\[(.*?)\]\((.*?)\)/.exec(src)
    if (!match || inInlineCode(src, match.index)) return undefined
    return { type: 'md-tip', raw: match[0], text: match[1], tooltip: match[2], tokens: [] } as Tokens.Generic
  },
  renderer(token) {
    const t = token as Tokens.Generic & { text: string; tooltip: string }
    return (
      '<span class="relative inline-block group">' +
      `<span class="cursor-help border-b border-dotted border-slate-500">${escapeHtml(t.text)}</span>` +
      '<span class="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 block">' +
      '<span class="relative block" style="min-width:max-content;max-width:24rem">' +
      `<span class="block bg-slate-800 text-white px-3 py-2 rounded-lg text-sm">${escapeHtml(t.tooltip)}</span>` +
      '<span class="absolute w-0 h-0 border-4 bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-t-slate-800 border-x-transparent border-b-transparent"></span>' +
      '</span></span></span>'
    )
  },
}

const switchExtension: TokenizerAndRendererExtension = {
  name: 'md-switch',
  level: 'inline',
  start(src) {
    const index = src.indexOf('!switch[')
    if (index === -1 || inInlineCode(src, index)) return undefined
    return index
  },
  tokenizer(src) {
    const match = /^!switch\[(.*?)\](?:\((.*?)\))?(?:\{(.*?)\})?/.exec(src)
    if (!match || inInlineCode(src, match.index)) return undefined
    const state = (match[2] || '').toLowerCase()
    return {
      type: 'md-switch',
      raw: match[0],
      text: match[1],
      checked: ['true', 'on', '1', 'yes'].includes(state),
      tokens: [],
    } as Tokens.Generic
  },
  renderer(token) {
    const t = token as Tokens.Generic & { text: string; checked: boolean }
    const knob = t.checked ? 'translate-x-4' : 'translate-x-0.5'
    const track = t.checked ? 'bg-primary-500' : 'bg-slate-300'
    return (
      '<span class="inline-flex items-center gap-2 align-middle">' +
      `<span class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${track}">` +
      `<span class="absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${knob}"></span></span>` +
      `<span class="text-sm">${escapeHtml(t.text)}</span></span>`
    )
  },
}

const iconExtension: TokenizerAndRendererExtension = {
  name: 'md-icon',
  level: 'inline',
  start(src) {
    const match = src.match(/:([a-zA-Z][a-zA-Z-]+)(?:\{[^}]+\})?:/)
    if (!match || match.index === undefined || inInlineCode(src, match.index)) return undefined
    return match.index
  },
  tokenizer(src) {
    const match = /^:([a-zA-Z][a-zA-Z-]+)(?:\{([^}]+)\})?:/.exec(src)
    if (!match || inInlineCode(src, match.index)) return undefined
    const [size = '20', color = 'currentColor'] = (match[2] || '').split(',').map((p) => p.trim())
    return {
      type: 'md-icon',
      raw: match[0],
      iconName: match[1],
      size: /^\d+$/.test(size) ? size : '20',
      color,
      tokens: [],
    } as Tokens.Generic
  },
  renderer(token) {
    const t = token as Tokens.Generic & { iconName: string; size: string; color: string }
    return (
      `<i data-md-icon="${escapeHtml(t.iconName.toLowerCase())}"` +
      ` style="width:${t.size}px;height:${t.size}px;color:${escapeHtml(t.color)}"` +
      ' class="inline-flex items-center justify-center relative top-[3px]"></i>'
    )
  },
}

// markdownExtensions 注册进 marked 的扩展集合
export const markdownExtensions: TokenizerAndRendererExtension[] = [
  tabsExtension,
  gridExtension,
  diffExtension,
  katexExtension,
  mermaidExtension,
  tocExtension,
  buttonExtension,
  tipExtension,
  switchExtension,
  iconExtension,
]

// ── 客户端交互绑定（tabs 切换 / mermaid 渲染 / lucide 图标填充）────────────

interface MermaidModule {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let mermaidModule: MermaidModule | null = null
let mermaidSeq = 0

// bindMarkdownInteractivity 在渲染容器上绑定扩展所需的客户端行为；
// root 元素在 React 重渲染间复用，用 dataset 标记避免重复绑定
export async function bindMarkdownInteractivity(root: HTMLElement): Promise<void> {
  if (!root.dataset.mdBound) {
    root.dataset.mdBound = '1'
    root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest('[data-md-tab]') as HTMLElement | null
      if (!button) return
      const group = button.dataset.mdTab as string
      const index = button.dataset.mdTabIndex
      root.querySelectorAll(`[data-md-tab="${group}"]`).forEach((b) => {
        const active = b.getAttribute('data-md-tab-index') === index
        b.setAttribute('aria-selected', String(active))
        b.classList.toggle('border-primary-500', active)
        b.classList.toggle('text-primary-600', active)
        b.classList.toggle('border-transparent', !active)
        b.classList.toggle('text-slate-500', !active)
      })
      root.querySelectorAll(`[data-md-tab-panel="${group}"]`).forEach((p) => {
        p.classList.toggle('hidden', p.getAttribute('data-md-tab-index') !== index)
      })
    })
  }

  // mermaid：动态加载，仅在出现图时引入体积较大的渲染器
  const mermaidBlocks = root.querySelectorAll<HTMLElement>('.md-mermaid pre')
  if (mermaidBlocks.length > 0) {
    try {
      if (!mermaidModule) {
        mermaidModule = (await import('mermaid')).default as unknown as MermaidModule
        mermaidModule.initialize({ startOnLoad: false, securityLevel: 'strict' })
      }
      for (const block of Array.from(mermaidBlocks)) {
        if (block.dataset.mdMermaidDone) continue
        block.dataset.mdMermaidDone = '1'
        const code = block.textContent || ''
        try {
          const { svg } = await mermaidModule.render(`md-mermaid-${++mermaidSeq}`, code)
          block.innerHTML = svg
        } catch {
          // 语法错误时保留源码展示
        }
      }
    } catch {
      // mermaid 加载失败时保留源码
    }
  }

  // lucide 图标：动态加载全量图标集并替换占位
  if (root.querySelector('[data-md-icon]')) {
    try {
      const { createIcons, icons } = await import('lucide')
      createIcons({ icons, nameAttr: 'data-md-icon' })
    } catch {
      // 图标加载失败时保留占位
    }
  }
}
