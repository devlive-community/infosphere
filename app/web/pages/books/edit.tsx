import { useEffect, useState } from 'react'
import Container from '@/components/Container'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import BookForm from '@/components/BookForm'
import type { Book } from '@/lib/types'

export default function EditBook() {
  const user = useRequireAuth()
  const router = useRouter()
  const slug = (router.query.slug as string) || ''
  const [book, setBook] = useState<Book | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || !slug) return
    api<Book>(`/books/slug/${encodeURIComponent(slug)}`)
      .then(setBook)
      .catch((e) => setError((e as Error).message))
  }, [user, slug])

  if (!user) return null
  if (error) return <p className="py-20 text-center text-rose-500">{error}</p>
  if (!book) return <p className="py-20 text-center text-slate-400">加载中…</p>

  return (
    <Container>
      <BookForm
        initial={book}
        heading="书籍设置"
        subheading="调整书籍的基本信息、封面与发布方式。"
        breadcrumb={book.title}
        submitLabel="保存设置"
        onSubmit={async (payload) => {
          delete payload.slug
          await api<Book>(`/books/${book.id}`, { method: 'PUT', body: payload })
          router.push(`/book/detail?slug=${encodeURIComponent(book.slug)}`)
        }}
      />
    </Container>
  )
}
