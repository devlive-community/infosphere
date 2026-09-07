import { useState } from 'react'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import Container from '@/components/Container'
import { useRouter } from 'next/router'
import { api, API_BASE, getToken } from '@/lib/api'
import { authHeaderFrom, getSSRUser, isInstalled, serverApi } from '@/lib/server-api'
import { Button } from '@/components/ui'
import { DownloadIcon } from '@/components/icons'
import BookForm from '@/components/BookForm'
import CollaboratorManager from '@/components/CollaboratorManager'
import type { Book, BookAccess, User } from '@/lib/types'

interface Props {
  installed: true
  user: User
  initialBook: Book
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, params, resolvedUrl }) => {
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const user = await getSSRUser(req)
  if (!user) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(resolvedUrl)}`, permanent: false } }
  }
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  if (!slug) return { notFound: true }
  const headers = authHeaderFrom(req)
  try {
    const [initialBook, access] = await Promise.all([
      serverApi<Book>(`/books/slug/${encodeURIComponent(slug)}`, { headers }),
      serverApi<BookAccess>(`/books/slug/${encodeURIComponent(slug)}/access`, { headers }),
    ])
    if (!access.can_manage) return { notFound: true }
    return { props: { installed: true, user, initialBook } }
  } catch {
    return { notFound: true }
  }
}

export default function EditBook({ initialBook }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter()
  const [book] = useState<Book>(initialBook)
  const [exporting, setExporting] = useState(false)

  // 导出书籍 zip：携带令牌下载（M16）
  async function exportZip() {
    if (!book) return
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
      alert((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Container>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white shadow-sm p-6">
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
        <BookForm
          initial={book}
          heading="书籍设置"
          subheading="调整书籍的基本信息、封面与发布方式。"
          breadcrumb={book.title}
          submitLabel="保存设置"
          onSubmit={async (payload) => {
            delete payload.slug
            await api<Book>(`/books/${book.id}`, { method: 'PUT', body: payload })
            router.push(`/book/detail/${encodeURIComponent(book.slug)}`)
          }}
        />
        <CollaboratorManager book={book} />
      </div>
    </Container>
  )
}
