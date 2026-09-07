import type { GetServerSideProps } from 'next'
import { authHeaderFrom, getSSRUser, isInstalled, serverApi } from '@/lib/server-api'
import WriterWorkbench from '@/components/WriterWorkbench'
import type { BookAccess, User } from '@/lib/types'

interface Props {
  user: User | null
  slug: string
  doc: string
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
  try {
    const access = await serverApi<BookAccess>(`/books/slug/${encodeURIComponent(slug)}/access`, { headers: authHeaderFrom(req) })
    if (!access.can_edit_content) return { notFound: true }
  } catch {
    return { notFound: true }
  }
  return {
    props: {
      user,
      slug,
      doc: typeof params?.doc === 'string' ? params.doc : '',
    },
  }
}

export default function WriterDocPage(props: Props) {
  return <WriterWorkbench {...props} />
}
