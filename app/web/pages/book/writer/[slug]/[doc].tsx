import type { GetServerSideProps } from 'next'
import { authHeaderFrom, getSSRUser, isInstalled } from '@/lib/server-api'
import WriterWorkbench from '@/components/WriterWorkbench'
import type { User } from '@/lib/types'

interface Props {
  user: User | null
  slug: string
  doc: string
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, params }) => {
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }
  const user = await getSSRUser(req)
  return {
    props: {
      user,
      slug: typeof params?.slug === 'string' ? params.slug : '',
      doc: typeof params?.doc === 'string' ? params.doc : '',
    },
  }
}

export default function WriterDocPage(props: Props) {
  return <WriterWorkbench {...props} />
}
