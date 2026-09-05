import type { GetServerSideProps } from 'next'

// 旧链接兼容：/book/writer?slug=x&doc=y → /book/x/writer
export default function LegacyWriter() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const slug = typeof query.slug === 'string' ? query.slug : ''
  if (!slug) return { notFound: true }
  return { redirect: { destination: `/book/${encodeURIComponent(slug)}/writer`, permanent: true } }
}
