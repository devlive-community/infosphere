import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Button, useFeedback } from '@/components/ui'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 清理：一键清理有问题的数据。目前支持清理采集混入的「永久链接」锚点，后续可扩展更多清理项。
export default function BookCleanup({ book }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [running, setRunning] = useState(false)

  async function cleanPermalinks() {
    setRunning(true)
    try {
      const r = await api<{ changed: number }>(`/books/${book.id}/cleanup/permalink-anchors`, { method: 'POST' })
      showToast({ message: t('bookSettings.cleanup.permalink.done', { count: r.changed }), tone: 'success' })
    } catch (e) {
      showToast({ title: t('bookSettings.cleanup.failed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="cleanup">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('bookSettings.cleanup.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('bookSettings.cleanup.subtitle')}</p>
      </div>
      <div className="max-w-xl space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">{t('bookSettings.cleanup.permalink.title')}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t('bookSettings.cleanup.permalink.desc')}</p>
          </div>
          <Button loading={running} onClick={cleanPermalinks} className="shrink-0">{t('bookSettings.cleanup.run')}</Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
