import type { GetServerSideProps } from 'next'

// 兼容：/book/{slug}/detail → /book/detail/{slug}
export default function Legacy() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  if (!slug) return { notFound: true }
  return { redirect: { destination: `/book/detail/${encodeURIComponent(slug)}`, permanent: true } }
}
