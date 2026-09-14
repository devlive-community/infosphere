import { useEffect, useRef, useState } from 'react'
import { GlobeIcon } from '@/components/icons'
import { Tooltip } from '@/components/ui'
import { LOCALES, useTranslation } from '@/lib/i18n'

// LanguageSwitcher 顶栏语言切换：地球图标 + 弹出语言列表
export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Tooltip content={t('common.language.label')} disabled={open}>
        <button type="button" aria-label={t('common.language.label')} aria-haspopup="menu" aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center justify-center rounded-lg transition-colors ${open ? 'bg-primary-50 text-primary-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
          style={{ width: 'var(--control-height)', height: 'var(--control-height)' }}>
          <GlobeIcon className="h-5 w-5" />
        </button>
      </Tooltip>
      {open && (
        <div role="menu" aria-label={t('common.language.label')}
          className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {LOCALES.map((l) => (
            <button key={l.value} role="menuitemradio" aria-checked={locale === l.value}
              onClick={() => { setLocale(l.value); setOpen(false) }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 ${locale === l.value ? 'font-medium text-primary-600' : 'text-slate-700'}`}>
              {t(l.labelKey)}
              {locale === l.value && <i className="fa-solid fa-check text-xs" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
