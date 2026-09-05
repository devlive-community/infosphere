import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { api } from '@/lib/api'
import { serverApi, getSiteConfig, siteUrlFrom, isInstalled } from '@/lib/server-api'
import { useApp } from '@/lib/auth'
import BookCard from '@/components/BookCard'
import Seo from '@/components/Seo'
import type { Book, SiteStats } from '@/lib/types'

interface HomeProps {
  installed: boolean
  site: Record<string, string>
  siteUrl: string
  stats: SiteStats
  latest: Book[]
  hot: Book[]
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async ({ req }) => {
  // 未安装时强制进入安装向导（服务端重定向，不渲染任何内容）
  if (!(await isInstalled())) {
    return { redirect: { destination: '/install', permanent: false } }
  }

  const [site, stats, latest, hot] = await Promise.all([
    getSiteConfig(),
    serverApi<SiteStats>('/stats').catch(() => null),
    serverApi<Book[]>('/explore/latest').catch(() => []),
    serverApi<Book[]>('/explore/hot').catch(() => []),
  ])
  return { props: { installed: true,  site, siteUrl: siteUrlFrom(req), stats: stats ?? { user_count: 0, book_count: 0, document_count: 0, total_views: 0 }, latest, hot } }
}

export default function Home({ site, siteUrl, stats, latest, hot }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const siteName = site.site_name || 'InfoSphere'
  const { user } = useApp()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  useEffect(() => setIsLoggedIn(!!user), [user])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    description: site.site_description || 'InfoSphere 知识管理系统',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/explore?title={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  const statCards = [
    { label: '注册用户', value: stats.user_count, icon: '👥' },
    { label: '知识书籍', value: stats.book_count, icon: '📚' },
    { label: '文档章节', value: stats.document_count, icon: '📄' },
    { label: '总浏览量', value: stats.total_views, icon: '🔥' },
  ]

  return (
    <div className="space-y-10">
      <Seo
        siteName={siteName}
        description={site.site_description || '简单而强大的开源知识管理系统，支持多数据库与多端访问。'}
        url={siteUrl}
        jsonLd={jsonLd}
      />

      <section className="rounded-2xl bg-gradient-to-r from-primary-600 to-violet-600 px-8 py-12 text-white">
        <h1 className="text-3xl font-bold">{siteName}</h1>
        <p className="mt-2 max-w-xl text-white/80">{site.site_description || '使用 InfoSphere 组织你的书籍与文档，支持公开分享、多数据库与多端访问。'}</p>
        <div className="mt-6 flex gap-3">
          <Link href="/explore" className="btn bg-white text-primary-600 hover:bg-white/90">开始探索</Link>
          {!isLoggedIn && <Link href="/register" className="btn border border-white/40 text-white hover:bg-white/10">注册账户</Link>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white shadow-sm flex items-center gap-4 p-5">
            <span className="text-3xl">{s.icon}</span>
            <span>
              <span className="block text-2xl font-bold text-slate-900">{s.value}</span>
              <span className="text-xs text-slate-500">{s.label}</span>
            </span>
          </div>
        ))}
      </section>

      <BookSection title="最新发布" books={latest} moreHref="/explore" />
      <BookSection title="热门阅读" books={hot} moreHref="/explore" />
    </div>
  )
}

function BookSection({ title, books, moreHref }: { title: string; books: Book[]; moreHref?: string }) {
  if (!books.length) return null
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {moreHref && <Link href={moreHref} className="text-sm text-primary-600 hover:underline">查看更多</Link>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((b) => <BookCard key={b.id} book={b} />)}
      </div>
    </section>
  )
}
