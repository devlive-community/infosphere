import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Button, ButtonLink, Input, useFeedback } from '@/components/ui'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import type { Book } from '@/lib/types'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 多语言与版本：语言/翻译分组/版本/版本分组（仅可管理者）。
// 多语言、版本各自是特性插件；禁用则隐藏对应字段，两者都禁用则整页 404。
export default function BookSettingsLocalization({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast } = useFeedback()
  const { site } = useApp()
  const { t } = useTranslation()
  const features = site.feature_plugins || []
  const transEnabled = features.includes('book-translations')
  const versionsEnabled = features.includes('book-versions')
  const [language, setLanguage] = useState(book.language || '')
  const [transGroup, setTransGroup] = useState(book.trans_group || '')
  const [version, setVersion] = useState(book.version || '')
  const [versionGroup, setVersionGroup] = useState(book.version_group || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api<Book>(`/books/${book.id}`, {
        method: 'PUT',
        body: {
          language: language.trim(),
          trans_group: transGroup.trim(),
          version: version.trim(),
          version_group: versionGroup.trim(),
        },
      })
      showToast({ message: t('bookSettings.localization.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('bookSettings.localization.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (!transEnabled && !versionsEnabled) {
    return (
      <BookSettingsLayout book={book} active="localization">
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-4xl font-bold text-slate-300">404</h1>
          <p className="mt-3 text-sm text-slate-500">{t('error.notfound.message')}</p>
          <ButtonLink href={`/book/settings/${encodeURIComponent(book.slug)}`}>{t('bookSettings.localization.heading')}</ButtonLink>
        </div>
      </BookSettingsLayout>
    )
  }

  return (
    <BookSettingsLayout book={book} active="localization">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{t('bookSettings.localization.heading')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('bookSettings.localization.subheading')}</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {transEnabled && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('common.language.label')}</label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder={t('bookForm.placeholder.language')} maxLength={32} />
            <p className="mt-1.5 text-xs text-slate-400">{t('bookForm.languageHint')}</p>
          </div>}
          {transEnabled && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('bookForm.label.transGroup')}</label>
            <Input value={transGroup} onChange={(e) => setTransGroup(e.target.value)} placeholder={t('bookForm.placeholder.transGroup')} maxLength={64} />
            <p className="mt-1.5 text-xs text-slate-400">{t('bookForm.transGroupHint')}</p>
          </div>}
          {versionsEnabled && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('bookForm.label.version')}</label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder={t('bookForm.placeholder.version')} maxLength={32} />
            <p className="mt-1.5 text-xs text-slate-400">{t('bookForm.versionHint')}</p>
          </div>}
          {versionsEnabled && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('bookForm.label.versionGroup')}</label>
            <Input value={versionGroup} onChange={(e) => setVersionGroup(e.target.value)} placeholder={t('bookForm.placeholder.versionGroup')} maxLength={64} />
            <p className="mt-1.5 text-xs text-slate-400">{t('bookForm.versionGroupHint')}</p>
          </div>}
        </div>

        <div className="mt-6 flex justify-end">
          <Button loading={saving} disabled={
            language === (book.language || '') &&
            transGroup === (book.trans_group || '') &&
            version === (book.version || '') &&
            versionGroup === (book.version_group || '')
          } onClick={save}>
            {t('common.actions.save')}
          </Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
