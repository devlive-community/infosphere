import { ReactNode } from 'react'

// Card 通用卡片容器
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className || ''}`.trim()}>{children}</div>
}

type BadgeTone = 'slate' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose' | 'primary'

const toneClass: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  primary: 'bg-primary-50 text-primary-600',
}

// Badge 状态徽标
export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge ${toneClass[tone]}`}>{children}</span>
}

// EmptyState 空数据占位
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-sm text-slate-400">{children}</div>
}
