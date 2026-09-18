import { Select } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

// Shared Portal Select owns clipping, viewport flipping and keyboard focus behavior.
export default function LanguageSwitcher() {
  const { locale, locales, setLocale, loading, error, t } = useTranslation()
  const choices = locales.filter((item) => item.enabled && (item.ui_enabled || item.content_enabled))
  return (
    <div className="min-w-0 max-w-[11rem]">
      <Select value={locale} disabled={loading}
        placeholder={t('common.language.label')}
        options={choices.map((item) => ({ value: item.code, label: item.native_name }))}
        onChange={(value) => { void setLocale(value) }} />
      {loading && <span role="status" className="sr-only">{t('global.pageLoading')}</span>}
      {error && <p role="alert" className="mt-1 max-w-full break-words text-xs text-rose-600">{error}</p>}
    </div>
  )
}
