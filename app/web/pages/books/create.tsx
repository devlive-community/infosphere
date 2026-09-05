import { useRouter } from 'next/router'
import Container from '@/components/Container'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import BookForm from '@/components/BookForm'
import type { Book } from '@/lib/types'

export default function CreateBook() {
  const user = useRequireAuth()
  const router = useRouter()

  if (!user) return null

  return (
    <Container>
      <BookForm
        heading="创建一本新书"
        subheading="先写下它的名字与方向，内容可以在创建后慢慢生长。"
        breadcrumb="新建书籍"
        submitLabel="创建书籍"
        showSaveDraft
        onSubmit={async (payload) => {
          const book = await api<Book>('/books', { method: 'POST', body: payload })
          router.push(`/book/writer?slug=${encodeURIComponent(book.slug)}`)
        }}
      />
    </Container>
  )
}
