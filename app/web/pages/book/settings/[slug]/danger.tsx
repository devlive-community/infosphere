import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { Button, useFeedback } from '@/components/ui'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 危险区：删除书籍等不可恢复操作（仅可管理者）
export default function BookSettingsDanger({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const router = useRouter()
  const { showToast, confirmAction } = useFeedback()
  const [deleting, setDeleting] = useState(false)

  async function removeBook() {
    if (!(await confirmAction({ title: '删除书籍', message: `确定删除《${book.title}》及其全部章节吗？此操作不可恢复。`, confirmLabel: '删除书籍', danger: true }))) return
    setDeleting(true)
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' })
      showToast({ title: '已删除', message: `《${book.title}》已删除`, tone: 'success' })
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
          <p className="mt-1 text-sm text-rose-600/80">以下操作不可恢复，请谨慎操作。</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="min-w-0">
            <div className="font-medium text-slate-900">删除书籍</div>
            <p className="mt-1 text-sm text-slate-500">永久删除本书及其全部章节、评论与阅读数据，无法恢复。</p>
          </div>
          <Button variant="danger" loading={deleting} onClick={removeBook}>删除书籍</Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
