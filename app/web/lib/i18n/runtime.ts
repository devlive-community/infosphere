import { IntlMessageFormat } from 'intl-messageformat'
import { zh } from './locales/zh'
import { en } from './locales/en'

export interface SiteLocale {
  code: string
  native_name: string
  direction: 'ltr' | 'rtl'
  enabled: boolean
  ui_enabled: boolean
  content_enabled: boolean
  is_default: boolean
  fallback_locale: string
  sort_order: number
}
export interface I18nSnapshot {
  locale: string
  default_locale: string
  items: SiteLocale[]
  chain: string[]
  messages: Record<string, Record<string, string>>
}
export const builtinMessages: Record<string, Record<string, string>> = { 'zh-CN': zh, en }
export const DEFAULT_SNAPSHOT: I18nSnapshot = {
  locale: 'zh-CN', default_locale: 'zh-CN',
  items: [
    { code: 'zh-CN', native_name: '简体中文', direction: 'ltr', enabled: true, ui_enabled: true, content_enabled: true, is_default: true, fallback_locale: '', sort_order: 0 },
    { code: 'en', native_name: 'English', direction: 'ltr', enabled: true, ui_enabled: true, content_enabled: true, is_default: false, fallback_locale: 'zh-CN', sort_order: 1 },
  ], chain: ['zh-CN'], messages: {},
}
export function normalizeLocale(value: string): string {
  if (value === 'zh') return 'zh-CN'
  try { return Intl.getCanonicalLocales(value)[0] || 'zh-CN' } catch { return 'zh-CN' }
}
export function cookieLocale(cookie = ''): string | undefined {
  const value = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('knowforge_locale='))?.slice('knowforge_locale='.length)
  try { return value ? normalizeLocale(decodeURIComponent(value)) : undefined } catch { return undefined }
}
export function resolvedMessages(snapshot: I18nSnapshot): Record<string, string> {
  const result: Record<string, string> = { ...zh }
  for (const code of [...snapshot.chain].reverse()) Object.assign(result, builtinMessages[code] || {}, snapshot.messages[code] || {})
  return result
}
const formatters = new Map<string, IntlMessageFormat>()
export function formatMessage(message: string, locale: string, vars?: Record<string, string | number>): string {
  try {
    const code = normalizeLocale(locale)
    const key = JSON.stringify([code, message])
    let formatter = formatters.get(key)
    if (!formatter) {
      formatter = new IntlMessageFormat(message, code, undefined, { ignoreTag: true })
      if (formatters.size >= 500) formatters.clear()
      formatters.set(key, formatter)
    }
    return String(formatter.format(vars || {}))
  }
  catch { return message.replace(/\{([A-Za-z_][\w]*)\}/g, (match, key: string) => vars?.[key] === undefined ? match : String(vars[key])) }
}
export function validateMessages(messages: Record<string, string>): void {
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value !== 'string') throw new Error(`Invalid message: ${key}`)
    try { new IntlMessageFormat(value, 'en', undefined, { ignoreTag: true }) }
    catch { throw new Error(`Invalid ICU message: ${key}`) }
    const source = en[key] || zh[key]
    if (!source) continue
    const names = (text: string) => Array.from(text.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g), (match) => match[1])
    if ([...new Set(names(source))].sort().join(',') !== [...new Set(names(value))].sort().join(',')) throw new Error(`Message variables differ: ${key}`)
  }
}
