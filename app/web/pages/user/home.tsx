import type { GetServerSideProps } from 'next'

// 兼容旧入口：/user/home?username=x → /user/{username}
export default function LegacyUserHome() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const username = typeof query.username === 'string' ? query.username : ''
  if (!username) return { notFound: true }
  return { redirect: { destination: `/user/${encodeURIComponent(username)}`, permanent: true } }
}
