import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useRef, useEffect, ReactNode } from 'react'
import { useApp } from '@/lib/auth'
import { API_BASE } from '@/lib/api'
import { ButtonLink } from '@/components/ui'

function UserMenu() {
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

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink href="/login" variant="outline">登录</ButtonLink>
        <ButtonLink href="/register">注册</ButtonLink>
      </div>
    )
  }
  const items = [
    { label: '我的书籍', href: '/books' },
    { label: '个人资料', href: '/user/profile' },
    { label: '账户安全', href: '/user/security' },
  ]
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50">
        {user.avatar
          ? <img src={user.avatar.startsWith('/') ? API_BASE + user.avatar : user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
          : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">{user.username[0]?.toUpperCase()}</span>}
        <span className="max-w-[120px] truncate text-sm">{user.username}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm hover:bg-slate-50">{item.label}</Link>
          ))}
          <button onClick={() => { setOpen(false); logout() }}
            className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">退出登录</button>
        </div>
      )}
    </div>
  )
}

export default function Layout({ title, children }: { title?: string; children: ReactNode }) {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  return (
    <div className="flex min-h-screen flex-col">
      <Head>
        <title>{title ? `${title} - ${siteName}` : siteName}</title>
        <meta name="description" content={site.site_description || 'InfoSphere 知识管理系统'} />
      </Head>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 text-lg font-bold text-slate-900">
              <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
              {siteName}
            </Link>
            <nav className="hidden items-center gap-4 text-sm text-slate-600 md:flex">
              <Link href="/explore" className="hover:text-primary-600">发现</Link>
              <Link href="/books" className="hover:text-primary-600">我的书籍</Link>
            </nav>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Powered by InfoSphere
      </footer>
    </div>
  )
}
