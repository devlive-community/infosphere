import { useRouter } from 'next/router'
import Seo from '@/components/Seo'
import Container from '@/components/Container'
import { api } from '@/lib/api'
import { useRequireAuth , useApp} from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import BookForm from '@/components/BookForm'
import { Loading } from '@/components/ui'
import type { Book } from '@/lib/types'

export default function CreateBook() {
  const user = useRequireAuth()
  const { site } = useApp()
  const { t } = useTranslation()
  const siteName = site.site_name || 'KnowForge'
  const router = useRouter()

  if (!user) return <Loading className="min-h-[60vh]" label={t('book.create.verifying')} />

  return (
    <>
      <Seo siteName={siteName} title={t('book.create.seoTitle')} noindex />
      <Container>
      <BookForm
        heading={t('book.create.heading')}
        subheading={t('book.create.subheading')}
        breadcrumb={t('book.create.breadcrumb')}
        submitLabel={t('book.create.submit')}
        showSaveDraft
        onSubmit={async (payload) => {
          const book = await api<Book>('/books', { method: 'POST', body: payload })
          router.push(`/book/writer/${encodeURIComponent(book.slug)}`)
        }}
      />
    </Container>
  </>
  )
}
