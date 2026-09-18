import { describe, expect, it } from 'vitest'
import { DEFAULT_SNAPSHOT, cookieLocale, formatMessage, normalizeLocale, resolvedMessages, validateMessages } from '../i18n/runtime'

describe('dynamic language resolution', () => {
  it('normalizes legacy cookies and retains regional language tags', () => {
    expect(cookieLocale('x=1; infosphere_locale=zh')).toBe('zh-CN')
    expect(cookieLocale('infosphere_locale=%invalid')).toBeUndefined()
    expect(normalizeLocale('ja-JP')).toBe('ja-JP')
  })
  it('uses a dynamic locale, then configured fallback, before the built-in fallback', () => {
    const messages = resolvedMessages({ ...DEFAULT_SNAPSHOT, locale: 'ja', chain: ['ja', 'en', 'zh-CN'], messages: { ja: { 'common.actions.save': '保存する' }, en: { 'test.fallback': 'Fallback' } } })
    expect(messages['common.actions.save']).toBe('保存する')
    expect(messages['test.fallback']).toBe('Fallback')
    expect(messages['common.actions.cancel']).toBe('Cancel')
  })
  it('supports ICU plural forms while preserving legacy interpolation', () => {
    expect(formatMessage('{count, plural, one {# book} other {# books}}', 'en', { count: 2 })).toBe('2 books')
    expect(formatMessage('Hello {name}', 'de', { name: 'Ada' })).toBe('Hello Ada')
  })
  it('rejects malformed language packs and changed placeholder contracts', () => {
    expect(() => validateMessages({ custom: '{count, plural, one {' })).toThrow()
    expect(() => validateMessages({ 'common.actions.save': '{password}' })).toThrow()
  })
})
