import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { Button, useFeedback } from '@/components/ui'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 危险区：将书籍移入回收站（仅可管理者）
export default function BookSettingsDanger({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const router = useRouter()
  const { showToast, confirmAction } = useFeedback()
  const [deleting, setDeleting] = useState(false)

  async function removeBook() {
    if (!(await confirmAction({ title: '移入回收站', message: `确定将《${book.title}》及其全部章节移入回收站吗？可在 30 天内恢复。`, confirmLabel: '移入回收站', danger: true }))) return
    setDeleting(true)
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' })
      showToast({ title: '已移入回收站', message: `《${book.title}》可在 30 天内恢复`, tone: 'success' })
      router.push('/books')
    } catch (e) {
      showToast({ title: '删除失败', message: (e as Error).message, tone: 'error' })
      setDeleting(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="danger">
      <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
        <div className="border-b border-rose-100 bg-rose-50/50 p-6">
          <h2 className="text-lg font-bold text-rose-700">危险区</h2>
          <p className="mt-1 text-sm text-rose-600/80">移入回收站后，内容将停止公开展示。</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="min-w-0">
            <div className="font-medium text-slate-900">移入回收站</div>
            <p className="mt-1 text-sm text-slate-500">本书及当前章节将保留 30 天，期间可从回收站恢复。</p>
          </div>
          <Button variant="danger" loading={deleting} onClick={removeBook}>移入回收站</Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
