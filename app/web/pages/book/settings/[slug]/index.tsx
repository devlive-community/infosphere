import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import BookForm from '@/components/BookForm'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { Button, Input, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import type { Book } from '@/lib/types'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 基本信息：标题/简介/封面/标签/发布与可见性（仅可管理者）
export default function BookSettingsBasic({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const router = useRouter()
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [slug, setSlug] = useState(book.slug)
  const [savingSlug, setSavingSlug] = useState(false)

  async function saveSlug() {
    const next = slug.trim()
    if (!next || next === book.slug) return
    setSavingSlug(true)
    try {
      const updated = await api<Book>(`/books/${book.id}`, { method: 'PUT', body: { slug: next } })
      showToast({ message: t('bookSettings.slug.saved'), tone: 'success' })
      router.replace(`/book/settings/${encodeURIComponent(updated.slug)}`)
    } catch (e) {
      showToast({ title: t('bookSettings.slug.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setSavingSlug(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="basic">
      {book.slug_editable && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
          <h2 className="text-lg font-bold text-slate-900">{t('bookSettings.slug.heading')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('bookSettings.slug.descPrefix')}<b className="text-amber-700">{t('bookSettings.slug.descBold')}</b>。</p>
          <div className="mt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input className="flex-1" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-book" />
              <Button className="shrink-0 sm:w-auto" loading={savingSlug} disabled={!slug.trim() || slug.trim() === book.slug} onClick={saveSlug}>
                {t('bookSettings.slug.save')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">{t('bookSettings.slug.hint')}</p>
          </div>
        </div>
      )}
      <BookForm
        initial={book}
        showHeader={false}
        heading={t('bookSettings.basic.heading')}
        subheading={t('bookSettings.basic.subheading')}
        breadcrumb={book.title}
        submitLabel={t('bookSettings.basic.submit')}
        onSubmit={async (payload) => {
          delete payload.slug
          await api<Book>(`/books/${book.id}`, { method: 'PUT', body: payload })
          router.push(`/book/detail/${encodeURIComponent(book.slug)}`)
        }}
      />
    </BookSettingsLayout>
  )
}
