import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { Button, useFeedback } from '@/components/ui'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { useTranslation } from '@/lib/i18n'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 危险区：将书籍移入回收站（仅可管理者）
export default function BookSettingsDanger({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const router = useRouter()
  const { t } = useTranslation()
  const { showToast, confirmAction } = useFeedback()
  const [deleting, setDeleting] = useState(false)

  async function removeBook() {
    if (!(await confirmAction({ title: t('bookSettings.danger.confirmTitle'), message: t('bookSettings.danger.confirmMsg', { title: book.title }), confirmLabel: t('bookSettings.danger.confirmBtn'), danger: true }))) return
    setDeleting(true)
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' })
      showToast({ title: t('bookSettings.danger.doneTitle'), message: t('bookSettings.danger.doneMsg', { title: book.title }), tone: 'success' })
      router.push('/books')
    } catch (e) {
      showToast({ title: t('bookSettings.danger.failTitle'), message: (e as Error).message, tone: 'error' })
      setDeleting(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="danger">
      <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
        <div className="border-b border-rose-100 bg-rose-50/50 p-6">
          <h2 className="text-lg font-bold text-rose-700">{t('bookSettings.danger.heading')}</h2>
          <p className="mt-1 text-sm text-rose-600/80">{t('bookSettings.danger.desc')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="min-w-0">
            <div className="font-medium text-slate-900">{t('bookSettings.danger.cardTitle')}</div>
            <p className="mt-1 text-sm text-slate-500">{t('bookSettings.danger.cardDesc')}</p>
          </div>
          <Button variant="danger" loading={deleting} onClick={removeBook}>{t('bookSettings.danger.button')}</Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
