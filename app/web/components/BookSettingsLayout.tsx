import Link from 'next/link'
import { ReactNode } from 'react'
import Container from '@/components/Container'
import Seo from '@/components/Seo'
import { resolveMediaUrl } from '@/lib/media'
import { GearIcon, UsersIcon, DownloadIcon, ExternalLinkIcon, PencilIcon, ListIcon, TrashIcon } from '@/components/icons'
import { ButtonLink } from '@/components/ui'
import type { Book } from '@/lib/types'

export type BookSettingsTab = 'basic' | 'chapters' | 'analytics' | 'collaborators' | 'export' | 'data' | 'danger'

interface BookSettingsLayoutProps {
  book: Book
  active: BookSettingsTab
  children: ReactNode
}

const NAV: { key: BookSettingsTab; label: string; icon: (p: { className?: string }) => JSX.Element; sub: string; danger?: boolean }[] = [
  { key: 'basic', label: '基本信息', icon: GearIcon, sub: '' },
  { key: 'chapters', label: '章节管理', icon: ListIcon, sub: 'chapters' },
  { key: 'analytics', label: '数据分析', icon: ({ className }) => <i className={`fa-solid fa-chart-line ${className || ''}`} aria-hidden="true" />, sub: 'analytics' },
  { key: 'collaborators', label: '协作者', icon: UsersIcon, sub: 'collaborators' },
  { key: 'export', label: '导出设置', icon: ({ className }) => <i className={`fa-solid fa-file-export ${className || ''}`} aria-hidden="true" />, sub: 'export' },
  { key: 'data', label: '导入导出', icon: DownloadIcon, sub: 'data' },
  { key: 'danger', label: '危险区', icon: TrashIcon, sub: 'danger', danger: true },
]

function statusLabel(status: string): string {
  return ({
    draft: '草稿', in_progress: '进行中', published: '已发布', completed: '已完成', archived: '已归档',
  } as Record<string, string>)[status] || status
}

// BookSettingsLayout 书籍设置：左侧书籍卡与导航 + 右侧内容区（对齐账户设置的双栏布局）
export default function BookSettingsLayout({ book, active, children }: BookSettingsLayoutProps) {
  const cover = resolveMediaUrl(book.cover_image)
  const base = `/book/settings/${encodeURIComponent(book.slug)}`
  const activeLabel = NAV.find((n) => n.key === active)?.label || '设置'
  return (
    <>
      <Seo title={`${book.title} - ${activeLabel}`} noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/books" className="hover:text-primary-600">我的书籍</Link>
          <span className="text-slate-300">/</span>
          <Link href={`/book/detail/${encodeURIComponent(book.slug)}`} className="max-w-[240px] truncate hover:text-primary-600">{book.title}</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">{activeLabel}</span>
        </nav>

        <div className="grid gap-6 pb-10 lg:grid-cols-[280px_1fr]">
          {/* 左：书籍卡 + 导航 */}
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-20">
            <div className="flex items-center gap-3">
              <span className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary-300 to-primary-600">
                {cover
                  ? <img src={cover} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-lg font-bold text-white/80">{book.title.slice(0, 1)}</span>}
              </span>
              <div className="min-w-0">
                <div className="truncate font-bold text-slate-900">{book.title}</div>
                <div className="truncate text-sm text-slate-400">{statusLabel(book.status)} · {book.is_public ? '公开' : '私密'}</div>
              </div>
            </div>

            <nav className="mt-4 space-y-1 border-t border-slate-100 pt-4">
              {NAV.map((item) => {
                const isActive = active === item.key
                const Icon = item.icon
                const activeCls = item.danger
                  ? 'bg-rose-50 font-medium text-rose-700 ring-1 ring-inset ring-rose-100'
                  : 'bg-primary-50 font-medium text-primary-700 ring-1 ring-inset ring-primary-100'
                const idleCls = item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-50'
                return (
                  <Link key={item.key} href={item.sub ? `${base}/${item.sub}` : base}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? activeCls : idleCls}`}>
                    <Icon className="h-4 w-4" /> {item.label}
                  </Link>
                )
              })}
            </nav>

            <div className="mt-6 space-y-2 border-t border-slate-100 pt-4">
              <ButtonLink href={`/book/writer/${encodeURIComponent(book.slug)}`} variant="outline" className="w-full hover:border-primary-400 hover:text-primary-600">
                <PencilIcon className="h-4 w-4" /> 进入写作
              </ButtonLink>
              <ButtonLink href={`/book/detail/${encodeURIComponent(book.slug)}`} variant="ghost" className="w-full text-slate-500 hover:text-primary-600">
                查看书籍详情 <ExternalLinkIcon className="h-3.5 w-3.5" />
              </ButtonLink>
            </div>
          </aside>

          {/* 右：内容 */}
          <div className="min-w-0">{children}</div>
        </div>
      </Container>
    </>
  )
}
