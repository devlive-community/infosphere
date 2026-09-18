import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { I18nProvider, useTranslation } from '../i18n'
import { DEFAULT_SNAPSHOT } from '../i18n/runtime'

vi.mock('next/router', () => ({ useRouter: () => ({ asPath: '/', replace: vi.fn() }) }))

function LanguageProbe() {
  const { locale, t, locales } = useTranslation()
  return <p lang={locale} data-languages={locales.length}>{t('common.actions.save')}</p>
}

describe('SSR language snapshot', () => {
  it('renders a runtime language on the first render and after serialization', () => {
    const initial = { ...DEFAULT_SNAPSHOT, locale: 'ja', chain: ['ja', 'en', 'zh-CN'], messages: { ja: { 'common.actions.save': '保存する' } }, items: [...DEFAULT_SNAPSHOT.items, { ...DEFAULT_SNAPSHOT.items[1], code: 'ja', native_name: '日本語' }] }
    const first = renderToString(<I18nProvider initial={initial}><LanguageProbe /></I18nProvider>)
    const hydrated = renderToString(<I18nProvider initial={JSON.parse(JSON.stringify(initial))}><LanguageProbe /></I18nProvider>)
    expect(first).toContain('lang="ja"')
    expect(first).toContain('data-languages="3"')
    expect(first).toContain('保存する')
    expect(hydrated).toBe(first)
  })
})
