import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { requireBookSettingsFeature } from '@/lib/book-settings'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Button, Input, Switch, useFeedback } from '@/components/ui'

export const getServerSideProps = requireBookSettingsFeature('watermark')

const MAX_WATERMARK = 60

export default function WatermarkSettings({ book }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [enabled, setEnabled] = useState(book.watermark_enabled || false)
  const [text, setText] = useState(book.watermark_text || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (enabled && !text.trim()) { showToast({ message: t('bookForm.error.watermark'), tone: 'error' }); return }
    setSaving(true)
    try {
      await api(`/books/${book.id}`, { method: 'PUT', body: { watermark_enabled: enabled, watermark_text: text.trim() } })
      showToast({ message: t('bookSettings.watermark.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('bookSettings.watermark.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="watermark">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('bookSettings.watermark.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('bookSettings.watermark.subtitle')}</p>
      </div>
      <div className="max-w-xl space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <div>
            <div className="text-sm font-medium text-slate-900">{t('bookForm.watermark.title')}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t('bookForm.watermark.desc')}</p>
          </div>
          <Switch checked={enabled} onChange={setEnabled} ariaLabel={t('bookForm.watermark.title')} />
        </div>
        {enabled && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('bookForm.watermark.label')}</label>
            <div className="relative">
              <Input value={text} maxLength={MAX_WATERMARK} onChange={(e) => setText(e.target.value)}
                placeholder={t('bookForm.watermark.placeholder')} className="pr-16" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{text.length} / {MAX_WATERMARK}</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{t('bookForm.watermark.hint')}</p>
          </div>
        )}
        <Button loading={saving} onClick={save}>{t('common.actions.save')}</Button>
      </div>
    </BookSettingsLayout>
  )
}
