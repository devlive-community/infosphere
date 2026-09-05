import type { GetServerSideProps } from 'next'

// 旧链接兼容：/book/detail?slug=x → /book/x/detail
export default function LegacyDetail() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const slug = typeof query.slug === 'string' ? query.slug : ''
  if (!slug) return { notFound: true }
  return { redirect: { destination: `/book/${encodeURIComponent(slug)}/detail`, permanent: true } }
}
