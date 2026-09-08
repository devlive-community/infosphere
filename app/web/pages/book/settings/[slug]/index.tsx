import type { InferGetServerSidePropsType } from 'next'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import BookForm from '@/components/BookForm'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import type { Book } from '@/lib/types'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 基本信息：标题/简介/封面/标签/发布与可见性（仅可管理者）
export default function BookSettingsBasic({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const router = useRouter()
  return (
    <BookSettingsLayout book={book} active="basic">
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
