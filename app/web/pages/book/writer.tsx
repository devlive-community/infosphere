import type { GetServerSideProps } from 'next'

// 兼容旧入口：/book/writer?slug=x&doc=y → /book/writer/{slug}
export default function LegacyWriter() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const slug = typeof query.slug === 'string' ? query.slug : ''
  if (!slug) return { notFound: true }
  return { redirect: { destination: `/book/writer/${encodeURIComponent(slug)}`, permanent: true } }
}
