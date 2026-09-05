import type { GetServerSideProps } from 'next'

// 兼容：/book/{slug}/{doc}/reader → /book/reader/{slug}/{doc}
export default function Legacy() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const doc = typeof params?.doc === 'string' ? params.doc : ''
  if (!slug || !doc) return { notFound: true }
  return { redirect: { destination: `/book/reader/${encodeURIComponent(slug)}/${encodeURIComponent(doc)}`, permanent: true } }
}
