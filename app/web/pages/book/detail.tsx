import type { GetServerSideProps } from 'next'

// 兼容旧入口：/book/detail?slug=x 与 /book/{slug}/detail → /book/detail/{slug}
export default function LegacyDetail() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ query, params }) => {
  const slug = (typeof query.slug === 'string' && query.slug) || (typeof params?.slug === 'string' && params.slug) || ''
  if (!slug) return { notFound: true }
  return { redirect: { destination: `/book/detail/${encodeURIComponent(slug)}`, permanent: true } }
}
