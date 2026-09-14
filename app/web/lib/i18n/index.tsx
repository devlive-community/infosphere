import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { zh } from './locales/zh'
import { en } from './locales/en'

// i18n 基础设施。键名格式强制：namespace.function.keyname（见 .claude/memory/conventions.md）
export type Locale = 'zh' | 'en'

export const DEFAULT_LOCALE: Locale = 'zh'
export const LOCALES: { value: Locale; labelKey: string }[] = [
  { value: 'zh', labelKey: 'common.language.zh' },
  { value: 'en', labelKey: 'common.language.en' },
]

const DICTS: Record<Locale, Record<string, string>> = { zh, en }
const STORAGE_KEY = 'infosphere_locale'

// translate 查字典：先当前语言，再回退默认语言，最后回退键本身；{var} 占位替换
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[locale] || DICTS[DEFAULT_LOCALE]
  let text = dict[key] ?? DICTS[DEFAULT_LOCALE][key] ?? key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR 与首屏统一用默认语言，避免 hydration 不一致；挂载后再应用用户所选
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (saved && DICTS[saved] && saved !== locale) setLocaleState(saved)
    } catch { /* 忽略 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try { document.documentElement.lang = locale } catch { /* 忽略 */ }
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 忽略 */ }
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale])

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext)
}
