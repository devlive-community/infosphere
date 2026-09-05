import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import BookForm from '@/components/BookForm'
import type { Book } from '@/lib/types'

export default function CreateBook() {
  const user = useRequireAuth()
  const router = useRouter()

  if (!user) return null

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">新建书籍</h1>
      <BookForm
        submitLabel="创建书籍"
        onSubmit={async (payload) => {
          const book = await api<Book>('/books', { method: 'POST', body: payload })
          router.push(`/book/detail?slug=${encodeURIComponent(book.slug)}`)
        }}
      />
    </div>
  )
}
