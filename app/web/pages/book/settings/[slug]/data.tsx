import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { API_BASE, getToken } from '@/lib/api'
import { Button, useFeedback } from '@/components/ui'
import { DownloadIcon } from '@/components/icons'
import PDFReimportPanel from '@/components/PDFReimportPanel'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 导入导出：markdown zip 导出与 PDF 重新导入（仅可管理者）
export default function BookSettingsData({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast } = useFeedback()
  const router = useRouter()
  const [exporting, setExporting] = useState(false)

  async function exportZip() {
    setExporting(true)
    try {
      const token = getToken()
      const res = await fetch(`${API_BASE}/api/v1/books/${book.id}/export?format=markdown`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('导出失败，请稍后重试')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${book.slug}.zip`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast({ title: '导出失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="data">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="font-semibold text-slate-900">数据导出</h2>
            <p className="mt-1 text-sm text-slate-500">
              打包为 markdown zip（front-matter + 章节正文 + 本站图片），可在其他 InfoSphere 站点导入。
            </p>
          </div>
          <Button variant="outline" loading={exporting} onClick={exportZip}>
            <DownloadIcon className="h-4 w-4" /> 导出 zip
          </Button>
        </div>
        <PDFReimportPanel bookId={book.id} onImported={() => router.replace(router.asPath)} />
      </div>
    </BookSettingsLayout>
  )
}
