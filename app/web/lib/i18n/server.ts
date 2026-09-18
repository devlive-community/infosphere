import type { IncomingMessage } from 'http'
import { DEFAULT_SNAPSHOT, type I18nSnapshot } from './runtime'
import { authHeaderFrom, serverApi } from '../server-api'

export async function getI18nSnapshot(req?: IncomingMessage): Promise<I18nSnapshot> {
  if (!req) return DEFAULT_SNAPSHOT
  const headers = authHeaderFrom(req)
  const language = req.headers['accept-language']
  if (language) headers['Accept-Language'] = language
  try {
    const registry = await serverApi<Pick<I18nSnapshot, 'locale' | 'default_locale' | 'items'>>('/i18n/locales', { headers })
    const bundle = await serverApi<Pick<I18nSnapshot, 'locale' | 'chain' | 'messages'>>('/i18n/messages/' + encodeURIComponent(registry.locale))
    // Both the SSR page and React hydration receive this exact snapshot.
    return { ...registry, ...bundle }
  } catch { return DEFAULT_SNAPSHOT }
}
