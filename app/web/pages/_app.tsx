import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { AppProvider, useApp } from '@/lib/auth'
import Layout from '@/components/Layout'
import Seo from '@/components/Seo'
import type { ReactNode } from 'react'
import type { SiteConfig } from '@/lib/types'

// 安装向导、登录注册与全屏编辑器使用独立布局
const bareRoutes = ['/install', '/login', '/register', '/book/writer']

// 无 SEO 价值的交互页统一 noindex
const noindexRoutes = ['/books', '/book/writer', '/user/profile', '/user/security', '/admin']

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { authReady, installed } = useApp()

  if (!authReady && installed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <span className="animate-pulse">InfoSphere 加载中…</span>
      </div>
    )
  }
  if (bareRoutes.includes(router.pathname)) {
    return (
      <div className="min-h-screen">
        <Seo noindex />
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

export default function App({ Component, pageProps }: AppProps) {
  // SSR 页面通过 getServerSideProps 注入安装状态、站点配置与公开数据
  return (
    <AppProvider initialSite={pageProps.site ?? null} initialInstalled={pageProps.installed ?? null} initialUser={pageProps.user ?? null}>
      <Shell>
        <Component {...pageProps} />
      </Shell>
    </AppProvider>
  )
}
