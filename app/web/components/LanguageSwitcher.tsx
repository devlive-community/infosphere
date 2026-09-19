import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { CheckIcon, GlobeIcon } from '@/components/icons'

// 语言选择器：导航栏图标按钮 + 下拉列表。相比宽 Select 更适配移动端窄栏。
export default function LanguageSwitcher() {
  const { locale, locales, setLocale, loading, error, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const choices = locales.filter((item) => item.enabled && (item.ui_enabled || item.content_enabled))

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(code: string) {
    setOpen(false)
    if (code !== locale) void setLocale(code)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" onClick={() => setOpen(!open)} disabled={loading}
        aria-label={t('common.language.label')} aria-haspopup="menu" aria-expanded={open}
        className="relative flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ width: 'var(--control-height)', height: 'var(--control-height)' }}>
        <GlobeIcon className="h-5 w-5" />
        {loading && <span role="status" className="sr-only">{t('global.pageLoading')}</span>}
      </button>

      {open && (
        <div role="menu" aria-label={t('common.language.label')}
          className="absolute right-0 top-12 z-40 max-h-96 w-44 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {choices.map((item) => {
            const active = item.code === locale
            return (
              <button key={item.code} type="button" role="menuitemradio" aria-checked={active}
                onClick={() => choose(item.code)}
                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${active ? 'font-medium text-primary-600' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span className="min-w-0 truncate">{item.native_name}</span>
                {active && <CheckIcon className="h-4 w-4 shrink-0 text-primary-600" />}
              </button>
            )
          })}
        </div>
      )}
      {error && <p role="alert" className="absolute right-0 top-12 z-40 mt-1 w-44 max-w-[calc(100vw-2rem)] break-words rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-rose-600 shadow-lg">{error}</p>}
    </div>
  )
}
