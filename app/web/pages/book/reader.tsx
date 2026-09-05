import type { GetServerSideProps } from 'next'

// 旧链接兼容：/book/reader?slug=x&doc=y → /book/x/y/reader
export default function LegacyReader() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const slug = typeof query.slug === 'string' ? query.slug : ''
  if (!slug) return { notFound: true }
  const doc = typeof query.doc === 'string' ? query.doc : ''
  const dest = doc ? `/book/${encodeURIComponent(slug)}/${encodeURIComponent(doc)}/reader` : `/book/${encodeURIComponent(slug)}/detail`
  return { redirect: { destination: dest, permanent: true } }
}
