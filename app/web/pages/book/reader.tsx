import type { GetServerSideProps } from 'next'

// 兼容旧入口：/book/reader?slug=x&doc=y → /book/reader/{slug}/{doc}
export default function LegacyReader() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const slug = typeof query.slug === 'string' ? query.slug : ''
  if (!slug) return { notFound: true }
  const doc = typeof query.doc === 'string' ? query.doc : ''
  const dest = doc ? `/book/reader/${encodeURIComponent(slug)}/${encodeURIComponent(doc)}` : `/book/detail/${encodeURIComponent(slug)}`
  return { redirect: { destination: dest, permanent: true } }
}
