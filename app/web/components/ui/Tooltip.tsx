import { ReactNode, useState } from 'react'

interface TooltipProps {
  content: ReactNode
  placement?: 'top' | 'bottom'
  children: ReactNode
  className?: string
}

// Tooltip 通用气泡提示：悬停即现（无延迟），纯 CSS 定位 + 淡入
export default function Tooltip({ content, placement = 'top', children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  return (
    <span className={`relative inline-flex ${className || ''}`.trim()}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg ${
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
          style={{ animation: 'tooltip-in 120ms ease-out' }}>
          {content}
          <span className={`absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-slate-900 ${
            placement === 'top' ? '-bottom-[3px]' : '-top-[3px]'
          }`} />
        </span>
      )}
    </span>
  )
}
