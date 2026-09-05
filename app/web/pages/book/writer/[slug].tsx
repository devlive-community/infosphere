import type { GetServerSideProps } from 'next'

// 兼容：/book/writer/{slug}（无章节）→ 跳书详情；由写作入口始终携带 doc 走双段路由
export default function LegacyWriter() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  if (!slug) return { notFound: true }
  return { redirect: { destination: `/book/detail/${encodeURIComponent(slug)}`, permanent: false } }
}
