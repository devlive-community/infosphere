import { ReactNode } from 'react'

// Loading 通用加载态：居中旋转圆环
export function Loading({ className, label = '加载中…' }: { className?: string; label?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-16 text-slate-400 ${className || ''}`.trim()}>
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

// SkeletonBlock 内容骨架（列表加载时可组合出卡片段落）
export function Skeleton({ className }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-slate-100 ${className || ''}`.trim()} />
}

// LoadingOverlay 按钮式区域切换时的局部遮罩
export function LoadingOverlay({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      {show && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
        </span>
      )}
    </div>
  )
}
