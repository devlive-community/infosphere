import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import BookForm from '@/components/BookForm'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { Button, Field, Input, useFeedback } from '@/components/ui'
import type { Book } from '@/lib/types'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 基本信息：标题/简介/封面/标签/发布与可见性（仅可管理者）
export default function BookSettingsBasic({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const router = useRouter()
  const { showToast } = useFeedback()
  const [slug, setSlug] = useState(book.slug)
  const [savingSlug, setSavingSlug] = useState(false)

  async function saveSlug() {
    const next = slug.trim()
    if (!next || next === book.slug) return
    setSavingSlug(true)
    try {
      const updated = await api<Book>(`/books/${book.id}`, { method: 'PUT', body: { slug: next } })
      showToast({ message: '访问路径已修改，此后不可再修改', tone: 'success' })
      router.replace(`/book/settings/${encodeURIComponent(updated.slug)}`)
    } catch (e) {
      showToast({ title: '修改失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setSavingSlug(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="basic">
      {book.slug_editable && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
          <h2 className="text-lg font-bold text-slate-900">访问路径</h2>
          <p className="mt-1 text-sm text-slate-500">复制得到的书籍可以修改一次访问路径（URL 中的 slug），<b className="text-amber-700">修改后不可再更改</b>。</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="访问路径" hint="仅小写字母、数字与中划线">
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-book" />
              </Field>
            </div>
            <Button variant="danger" loading={savingSlug} disabled={!slug.trim() || slug.trim() === book.slug} onClick={saveSlug}>
              保存访问路径
            </Button>
          </div>
        </div>
      )}
      <BookForm
        initial={book}
        showHeader={false}
        heading="基本信息"
        subheading="调整书籍的标题、简介、封面、标签与发布方式。"
        breadcrumb={book.title}
        submitLabel="保存设置"
        onSubmit={async (payload) => {
          delete payload.slug
          await api<Book>(`/books/${book.id}`, { method: 'PUT', body: payload })
          router.push(`/book/detail/${encodeURIComponent(book.slug)}`)
        }}
      />
    </BookSettingsLayout>
  )
}
