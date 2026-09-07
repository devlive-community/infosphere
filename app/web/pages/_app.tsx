import '../styles/globals.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { AppProvider, useApp } from '@/lib/auth'
import Layout from '@/components/Layout'
import Seo from '@/components/Seo'
import { Loading } from '@/components/ui'
import type { ReactNode } from 'react'
import type { SiteConfig } from '@/lib/types'

// 安装向导、登录注册、全屏编辑器/阅读器与管理控制台使用独立布局（前缀匹配，覆盖动态路由）
const bareRoutes = ['/install', '/login', '/register', '/book/writer', '/book/reader', '/admin']

// 无 SEO 价值的交互页统一 noindex（前缀匹配）
const noindexRoutes = ['/books', '/book/writer', '/user/profile', '/user/security', '/admin']

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { authReady, installed } = useApp()

  if (!authReady && installed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm">
        <Loading label="正在加载 InfoSphere…" />
      </div>
    )
  }
  if (bareRoutes.some((r) => router.pathname === r || router.pathname.startsWith(r + '/'))) {
    return (
      <div className="min-h-screen">
        {!router.pathname.startsWith('/book/reader') && <Seo noindex />}
        {children}
      </div>
    )
  }
  return (
    <Layout>
      {noindexRoutes.includes(router.pathname) && <Seo noindex />}
      {children}
    </Layout>
  )
}

// RouteLoading 覆盖所有需要服务端取数的页面跳转，避免等待 SSR 响应时整页无反馈。
function RouteLoading() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const start = (_url: string, options: { shallow: boolean }) => {
      if (!options.shallow) setLoading(true)
    }
    const done = () => setLoading(false)
    router.events.on('routeChangeStart', start)
    router.events.on('routeChangeComplete', done)
    router.events.on('routeChangeError', done)
    return () => {
      router.events.off('routeChangeStart', start)
      router.events.off('routeChangeComplete', done)
      router.events.off('routeChangeError', done)
    }
  }, [router.events])

  if (!loading) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary-100 shadow-[0_1px_5px_rgba(65,105,225,0.18)]" role="status" aria-live="polite">
      <span className="block h-full w-2/3 animate-pulse bg-gradient-to-r from-primary-300 via-primary-600 to-primary-400" />
      <span className="sr-only">页面加载中…</span>
    </div>
  )
}

export default function App({ Component, pageProps }: AppProps) {
  // SSR 页面通过 getServerSideProps 注入安装状态、站点配置与公开数据
  return (
    <AppProvider initialSite={pageProps.site ?? null} initialInstalled={pageProps.installed ?? null} initialUser={pageProps.user ?? null}>
      <RouteLoading />
      <Shell>
        <Component {...pageProps} />
      </Shell>
    </AppProvider>
  )
}
