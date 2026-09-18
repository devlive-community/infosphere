import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/router'
import { api, getToken } from '../api'
import { DEFAULT_SNAPSHOT, builtinMessages, cookieLocale, formatMessage, normalizeLocale, resolvedMessages, type I18nSnapshot, type SiteLocale } from './runtime'
export type { I18nSnapshot, SiteLocale } from './runtime'
export type Locale = string
export const DEFAULT_LOCALE = 'zh-CN'

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const messages = builtinMessages[normalizeLocale(locale)] || builtinMessages[DEFAULT_LOCALE]
  return formatMessage(messages[key] ?? builtinMessages[DEFAULT_LOCALE][key] ?? key, locale, vars)
}

interface I18nContextValue {
  locale: string
  locales: SiteLocale[]
  defaultLocale: string
  loading: boolean
  error: string
  setLocale: (locale: string) => Promise<void>
  refreshLanguages: () => Promise<void>
  t: (key: string, vars?: Record<string, string | number>) => string
}
const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE, locales: DEFAULT_SNAPSHOT.items, defaultLocale: DEFAULT_LOCALE,
  loading: false, error: '', setLocale: async () => {}, refreshLanguages: async () => {}, t: (key) => key,
})

export async function fetchI18nSnapshot(locale?: string): Promise<I18nSnapshot> {
  const registry = await api<Pick<I18nSnapshot, 'items' | 'default_locale' | 'locale'>>('/i18n/locales', { params: { locale } })
  const bundle = await api<Pick<I18nSnapshot, 'locale' | 'chain' | 'messages'>>('/i18n/messages/' + encodeURIComponent(registry.locale))
  return { ...registry, ...bundle }
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: I18nSnapshot }) {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState(initial || DEFAULT_SNAPSHOT)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestID = useRef(0)
  useEffect(() => { if (initial) setSnapshot(initial) }, [initial])
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem('infosphere_locale') } catch { /* storage unavailable */ }
    const legacy = !cookieLocale(document.cookie) && saved ? normalizeLocale(saved) : undefined
    if (legacy) document.cookie = 'infosphere_locale=' + encodeURIComponent(legacy) + '; path=/; max-age=31536000; SameSite=Lax'
    if (!initial || legacy) void fetchI18nSnapshot(legacy).then(setSnapshot).catch(() => {})
  }, [initial])
  useEffect(() => {
    document.documentElement.lang = snapshot.locale
    document.documentElement.dir = snapshot.items.find((item) => item.code === snapshot.locale)?.direction || 'ltr'
  }, [snapshot])
  const refreshLanguages = useCallback(async () => {
    setSnapshot(await fetchI18nSnapshot(snapshot.locale))
  }, [snapshot.locale])
  const setLocale = useCallback(async (value: string) => {
    const id = ++requestID.current
    setLoading(true); setError('')
    try {
      const next = await fetchI18nSnapshot(normalizeLocale(value))
      if (id !== requestID.current) return
      if (getToken()) await api('/auth/locale', { method: 'PUT', body: { locale: next.locale } })
      if (id !== requestID.current) return
      document.cookie = 'infosphere_locale=' + encodeURIComponent(next.locale) + '; path=/; max-age=31536000; SameSite=Lax'
      try { localStorage.setItem('infosphere_locale', next.locale) } catch { /* storage unavailable */ }
      setSnapshot(next)
      await router.replace(router.asPath, undefined, { scroll: false })
    } catch (cause) {
      if (id === requestID.current) setError((cause as Error).message)
    } finally { if (id === requestID.current) setLoading(false) }
  }, [router])
  const messages = useMemo(() => resolvedMessages(snapshot), [snapshot])
  const t = useCallback((key: string, vars?: Record<string, string | number>) => formatMessage(messages[key] ?? key, snapshot.locale, vars), [messages, snapshot.locale])
  return <I18nContext.Provider value={{ locale: snapshot.locale, locales: snapshot.items, defaultLocale: snapshot.default_locale, loading, error, setLocale, refreshLanguages, t }}>{children}</I18nContext.Provider>
}
export function useTranslation(): I18nContextValue { return useContext(I18nContext) }
