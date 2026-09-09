import type { ReactNode } from 'react'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// HighlightText 通过 React 文本节点渲染命中词，不拼接 HTML，避免搜索词造成 XSS。
export default function HighlightText({ text, query }: { text: string; query?: string }): ReactNode {
  const terms = Array.from(new Set((query || '').trim().split(/\s+/).filter(Boolean)))
    .sort((a, b) => b.length - a.length)
  if (terms.length === 0) return text
  const matcher = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
  return text.split(matcher).map((part, index) => (
    terms.some((term) => term.toLocaleLowerCase() === part.toLocaleLowerCase())
      ? <mark key={`${part}-${index}`} className="rounded-sm bg-amber-100 px-0.5 text-inherit">{part}</mark>
      : part
  ))
}
