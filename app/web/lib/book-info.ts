import type { BookInfoItem } from '@/lib/types'

type TFn = (key: string, vars?: Record<string, string | number>) => string

// 书籍「更多信息」的预置类型（与服务端 app.bookInfoTypes 一致）：图标、取值类型（决定校验与展示方式）。
export const BOOK_INFO_TYPES: { type: string; icon: string; kind: 'url' | 'email' | 'text' }[] = [
  { type: 'github', icon: 'fa-brands fa-github', kind: 'url' },
  { type: 'gitlab', icon: 'fa-brands fa-gitlab', kind: 'url' },
  { type: 'gitee', icon: 'fa-solid fa-code-branch', kind: 'url' },
  { type: 'website', icon: 'fa-solid fa-globe', kind: 'url' },
  { type: 'source', icon: 'fa-solid fa-file-lines', kind: 'url' },
  { type: 'docs', icon: 'fa-solid fa-book', kind: 'url' },
  { type: 'demo', icon: 'fa-solid fa-display', kind: 'url' },
  { type: 'email', icon: 'fa-solid fa-envelope', kind: 'email' },
  { type: 'author', icon: 'fa-solid fa-user-pen', kind: 'text' },
  { type: 'license', icon: 'fa-solid fa-scale-balanced', kind: 'text' },
  { type: 'version', icon: 'fa-solid fa-tag', kind: 'text' },
  { type: 'isbn', icon: 'fa-solid fa-barcode', kind: 'text' },
  { type: 'custom', icon: 'fa-solid fa-circle-info', kind: 'text' },
]

export function bookInfoType(type: string) {
  return BOOK_INFO_TYPES.find((d) => d.type === type) || BOOK_INFO_TYPES[BOOK_INFO_TYPES.length - 1]
}

const isHTTP = (v: string) => /^https?:\/\/\S+$/i.test(v)

// bookInfoLabel 显示名：自定义名称优先，否则按类型取默认名（i18n：bookInfo.type.<type>）。
export function bookInfoLabel(t: TFn, item: BookInfoItem): string {
  return item.label?.trim() || t(`bookInfo.type.${bookInfoType(item.type).type}`)
}

// bookInfoHref 可点击的链接：链接类型/自定义项中的 http(s) 值 → 原链接；邮箱 → mailto；其余不可点击。
export function bookInfoHref(item: BookInfoItem): string | undefined {
  const kind = bookInfoType(item.type).kind
  if (kind === 'email') return `mailto:${item.value}`
  if ((kind === 'url' || item.type === 'custom') && isHTTP(item.value)) return item.value
  return undefined
}

// bookInfoDisplay 链接类展示时去掉协议与末尾斜杠（完整地址在 Tooltip 中）。
export function bookInfoDisplay(item: BookInfoItem): string {
  return bookInfoHref(item) && isHTTP(item.value) ? item.value.replace(/^https?:\/\//i, '').replace(/\/$/, '') : item.value
}
