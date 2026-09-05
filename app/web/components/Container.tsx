import { ReactNode } from 'react'

// Container 页面内容容器：居中限宽 + 水平内边距
// （Layout 的 main 是全宽的，全宽区块由页面自行铺满）
export default function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 ${className || ''}`.trim()}>{children}</div>
}
