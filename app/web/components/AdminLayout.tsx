import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useRef, useEffect, ReactNode } from 'react'
import { useApp } from '@/lib/auth'
import { API_BASE } from '@/lib/api'
import NotificationBell from '@/components/NotificationBell'
import {
  GridIcon, GearIcon, UsersIcon, CloudIcon,
  SearchIcon, ArrowLeftIcon, ChevronDownIcon, ListBulletIcon,
} from '@/components/icons'

export type AdminNavKey = 'system' | 'users' | 'settings' | 'upgrade'

const NAV: { key: AdminNavKey; label: string; href: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: 'system', label: '系统概览', href: '/admin/system', icon: GridIcon },
  { key: 'users', label: '用户管理', href: '/admin/users', icon: UsersIcon },
  { key: 'settings', label: '系统设置', href: '/admin/settings/site', icon: GearIcon },
  { key: 'upgrade', label: '版本更新', href: '/admin/upgrade', icon: CloudIcon },
]

// 控制台顶栏用户菜单：头像 + 退出登录 / 返回站点
function AdminUserMenu() {
  const { user, logout } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])
  if (!user) return null
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 hover:bg-slate-50">
        {user.avatar
          ? <img src={user.avatar.startsWith('/') ? API_BASE + user.avatar : user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
          : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">{user.username[0]?.toUpperCase()}</span>}
        <span className="hidden max-w-[120px] truncate text-sm text-slate-700 sm:inline">{user.username}</span>
        <ChevronDownIcon className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <Link href="/user/profile" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-slate-50">个人资料</Link>
          <Link href="/" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-slate-50">返回站点</Link>
          <button onClick={() => { setOpen(false); logout() }}
            className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">退出登录</button>
        </div>
      )}
    </div>
  )
}

function SidebarNav({ current, onNavigate }: { current: AdminNavKey; onNavigate?: () => void }) {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  return (
    <div className="flex h-full flex-col">
      <Link href="/admin/system" className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-100 px-5">
        <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
        <span className="text-base font-bold text-slate-900">{siteName}</span>
        <span className="text-xs font-medium text-slate-400">管理后台</span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = item.key === current
          const Icon = item.icon
          return (
            <Link key={item.key} href={item.href} onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}>
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <Link href="/" onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeftIcon className="h-5 w-5 shrink-0" />
          返回站点
        </Link>
      </div>
    </div>
  )
}

interface AdminLayoutProps {
  current: AdminNavKey
  breadcrumb: string
  children: ReactNode
}

// AdminLayout 管理控制台布局：侧边导航 + 顶栏（仅管理员可访问）
export default function AdminLayout({ current, breadcrumb, children }: AdminLayoutProps) {
  const { user, authReady, site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const [drawer, setDrawer] = useState(false)
  const router = useRouter()
  useEffect(() => { setDrawer(false) }, [router.pathname])
  const isAdmin = user?.role === 'admin'

  // 鉴权就绪前只渲染极简占位，绝不渲染后台骨架，避免向游客/普通用户泄露布局
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        <span className="animate-pulse">加载中…</span>
      </div>
    )
  }

  // 非管理员（含未登录）一律呈现 404，控制台对其不可见
  if (!isAdmin) {
    return (
      <>
        <Head><title>404</title><meta name="robots" content="noindex, nofollow" /></Head>
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
          <h1 className="text-6xl font-bold text-slate-300">404</h1>
          <p className="mt-4 text-slate-500">页面不存在或已被移除</p>
          <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600">返回首页</Link>
        </div>
      </>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Head><title>{`${breadcrumb} - ${siteName} 管理后台`}</title></Head>

      {/* 侧边栏（桌面固定） */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white md:block">
        <SidebarNav current={current} />
      </aside>

      {/* 移动端抽屉 */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-slate-200 bg-white">
            <SidebarNav current={current} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setDrawer(true)} aria-label="打开菜单"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden">
            <ListBulletIcon className="h-5 w-5" />
          </button>
          <nav className="flex items-center gap-2 text-sm text-slate-400">
            <span className="hidden sm:inline">管理后台</span>
            <span className="hidden sm:inline">/</span>
            <span className="font-medium text-slate-700">{breadcrumb}</span>
          </nav>
          <div className="ml-auto hidden w-full max-w-sm lg:block">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon className="h-4 w-4" /></span>
              <input type="search" placeholder="搜索设置或功能"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none" />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <NotificationBell />
            <AdminUserMenu />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
