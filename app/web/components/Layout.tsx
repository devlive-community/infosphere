import Head from 'next/head'
import Link from 'next/link'
import { useState, useRef, useEffect, ReactNode } from 'react'
import { useApp } from '@/lib/auth'
import { API_BASE } from '@/lib/api'
import { ButtonLink } from '@/components/ui'
import { SearchIcon } from '@/components/icons'

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
        <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">登录</Link>
        <ButtonLink href="/register">注册</ButtonLink>
      </div>
    )
  }
  const items = [
    { label: '我的书籍', href: '/books' },
    { label: '个人资料', href: '/user/profile' },
    { label: '账户安全', href: '/user/security' },
    { label: '系统管理', href: '/admin/system' },
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
  const year = new Date().getFullYear()
  return (
    <div className="flex min-h-screen flex-col">
      <Head>
        <title>{title ? `${title} - ${siteName}` : siteName}</title>
        <meta name="description" content={site.site_description || 'InfoSphere 知识管理系统'} />
      </Head>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-lg font-bold text-slate-900">
            <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
            {siteName}
          </Link>
          <nav className="hidden items-center gap-1 text-sm font-medium text-slate-600 md:flex">
            <Link href="/explore" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">发现</Link>
            <Link href="/books" className="rounded-lg px-3 py-2 hover:bg-slate-100 hover:text-slate-900">我的书籍</Link>
          </nav>
          <form action="/explore" method="get" className="relative ml-auto hidden w-full max-w-sm lg:block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="title"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-primary-500 focus:bg-white focus:outline-none"
              placeholder="搜索书籍、主题或作者" />
          </form>
          <div className="ml-auto lg:ml-0">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>

      <footer className="bg-[#0b1f3f] text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 text-lg font-bold text-white">
              <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
              {siteName}
            </div>
            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">
              开源自托管的知识管理系统，帮助你沉淀知识、连接思想，与世界分享。
            </p>
          </div>
          <FooterColumn title="产品" links={[
            { label: '发现', href: '/explore' },
            { label: '我的书籍', href: '/books' },
          ]} />
          <FooterColumn title="资源" links={[
            { label: '文档', href: 'https://github.com/devlive-community/infosphere' },
            { label: '问题反馈', href: 'https://github.com/devlive-community/infosphere/issues' },
          ]} />
          <FooterColumn title="社区" links={[
            { label: 'GitHub', href: 'https://github.com/devlive-community/infosphere' },
            { label: '讨论区', href: 'https://github.com/devlive-community/infosphere/discussions' },
          ]} />
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-4 py-4 text-xs text-slate-400 md:flex-row">
            <span>© {year} {siteName} · Powered by InfoSphere</span>
            <span>开源许可：MIT</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            {/^https?:\/\//.test(l.href)
              ? <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-slate-400 transition-colors hover:text-white">{l.label}</a>
              : <Link href={l.href} className="text-slate-400 transition-colors hover:text-white">{l.label}</Link>}
          </li>
        ))}
      </ul>
    </div>
  )
}
