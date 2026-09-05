import { ReactNode } from 'react'

// Card 通用卡片容器
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className || ''}`.trim()}>
      {children}
    </div>
  )
}

type BadgeTone = 'slate' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose' | 'primary'

const toneClass: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  primary: 'bg-primary-50 text-primary-700 ring-primary-200',
}

// Badge 状态徽标
export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass[tone]}`}>
      {children}
    </span>
  )
}

// EmptyState 空数据占位
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-16 text-center text-sm text-slate-400">
      {children}
    </div>
  )
}
