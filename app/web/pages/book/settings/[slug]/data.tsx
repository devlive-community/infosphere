import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { API_BASE, getToken } from '@/lib/api'
import { Button, useFeedback } from '@/components/ui'
import { DownloadIcon } from '@/components/icons'
import PDFReimportPanel from '@/components/PDFReimportPanel'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { useTranslation } from '@/lib/i18n'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 导入导出：markdown zip 导出与 PDF 重新导入（仅可管理者）
export default function BookSettingsData({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const router = useRouter()
  const [exporting, setExporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  async function downloadBook(path: string, ext: string, setBusy: (v: boolean) => void, failTitle: string) {
    setBusy(true)
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      if (!res.ok) {
        const msg = await res.json().then((p) => p.message).catch(() => '')
        throw new Error(msg || t('bookSettings.data.exportFailed'))
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${book.slug}.${ext}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast({ title: failTitle, message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const exportZip = () => downloadBook(`/books/${book.id}/export?format=markdown`, 'zip', setExporting, t('bookSettings.data.exportZipFailed'))
  const exportPdf = () => downloadBook(`/books/${book.id}/export/pdf?style=mine`, 'pdf', setExportingPdf, t('bookSettings.data.exportPdfFailed'))

  return (
    <BookSettingsLayout book={book} active="data">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="font-semibold text-slate-900">{t('bookSettings.data.pdfHeading')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t('bookSettings.data.pdfDesc')}
            </p>
          </div>
          <Button loading={exportingPdf} onClick={exportPdf}>
            <DownloadIcon className="h-4 w-4" /> {t('bookSettings.data.pdfBtn')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="font-semibold text-slate-900">{t('bookSettings.data.zipHeading')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t('bookSettings.data.zipDesc')}
            </p>
          </div>
          <Button variant="outline" loading={exporting} onClick={exportZip}>
            <DownloadIcon className="h-4 w-4" /> {t('bookSettings.data.zipBtn')}
          </Button>
        </div>
        <PDFReimportPanel bookId={book.id} onImported={() => router.replace(router.asPath)} />
      </div>
    </BookSettingsLayout>
  )
}
