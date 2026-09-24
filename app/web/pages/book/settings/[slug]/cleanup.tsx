import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Button, useFeedback } from '@/components/ui'
import { isQueuedTask, waitForTask, type QueuedTask } from '@/lib/background-tasks'

interface LocalizeResult { localized: number; failed: number; docs_changed: number; limit_reached: boolean; failures: { url: string; error: string }[] }

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 清理：一键清理有问题的数据。目前支持清理采集混入的「永久链接」锚点，后续可扩展更多清理项。
export default function BookCleanup({ book }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const { site } = useApp()
  // 「改写为站内链接」依赖采集记录，由内容采集插件提供；插件禁用时隐藏
  const collectEnabled = (site.feature_plugins || []).includes('content-collect')
  const [running, setRunning] = useState('')
  const [localized, setLocalized] = useState<LocalizeResult | null>(null)

  // 外链图片本地化：后台任务，完成后展示结果（失败的地址与原因）
  async function localizeImages() {
    setRunning('localize-images')
    setLocalized(null)
    try {
      const r = await api<LocalizeResult | QueuedTask<LocalizeResult>>(`/books/${book.id}/cleanup/localize-images`, { method: 'POST' })
      const result = isQueuedTask(r) ? await waitForTask<LocalizeResult>(r.task.id) : r
      setLocalized(result)
      showToast({ message: t('bookSettings.cleanup.localize.done', { count: result.localized, docs: result.docs_changed }), tone: result.failed > 0 ? 'error' : 'success' })
    } catch (e) {
      showToast({ title: t('bookSettings.cleanup.failed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setRunning('')
    }
  }

  async function run(path: string, doneKey: string) {
    setRunning(path)
    try {
      const r = await api<{ changed: number }>(`/books/${book.id}/cleanup/${path}`, { method: 'POST' })
      showToast({ message: t(doneKey, { count: r.changed }), tone: 'success' })
    } catch (e) {
      showToast({ title: t('bookSettings.cleanup.failed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setRunning('')
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
          <Button loading={running === 'permalink-anchors'} disabled={!!running} onClick={() => run('permalink-anchors', 'bookSettings.cleanup.permalink.done')} className="shrink-0">{t('bookSettings.cleanup.run')}</Button>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{t('bookSettings.cleanup.localize.title')}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t('bookSettings.cleanup.localize.desc')}</p>
            </div>
            <Button loading={running === 'localize-images'} disabled={!!running} onClick={localizeImages} className="shrink-0">{t('bookSettings.cleanup.run')}</Button>
          </div>
          {running === 'localize-images' && <p className="mt-3 text-xs text-slate-500">{t('bookSettings.cleanup.localize.running')}</p>}
          {localized && (
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              <div>{t('bookSettings.cleanup.localize.summary', { count: localized.localized, docs: localized.docs_changed, failed: localized.failed })}</div>
              {localized.limit_reached && <div className="text-amber-600">{t('bookSettings.cleanup.localize.limit')}</div>}
              {localized.failures.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {localized.failures.map((f) => <li key={f.url} className="[overflow-wrap:anywhere] text-rose-600">{f.url} — {f.error}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        {collectEnabled && <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">{t('bookSettings.cleanup.internalLinks.title')}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t('bookSettings.cleanup.internalLinks.desc')}</p>
          </div>
          <Button loading={running === 'internal-links'} disabled={!!running} onClick={() => run('internal-links', 'bookSettings.cleanup.internalLinks.done')} className="shrink-0">{t('bookSettings.cleanup.run')}</Button>
        </div>}
      </div>
    </BookSettingsLayout>
  )
}
