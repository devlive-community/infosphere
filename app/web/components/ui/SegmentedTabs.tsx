import Link from 'next/link'
import { ReactNode } from 'react'
import Tooltip from './Tooltip'

export interface SegmentedTabItem {
  value: string
  label: ReactNode
  href?: string
  icon?: ReactNode
  disabled?: boolean
}

interface SegmentedTabsProps {
  value: string
  items: SegmentedTabItem[]
  ariaLabel: string
  onChange?: (value: string) => void
  className?: string
  fullWidth?: boolean
  iconOnly?: boolean
  size?: 'sm' | 'md'
}

// SegmentedTabs 全站横向 Tab 唯一实现：浅色卡片轨道 + 独立选中卡片。
export function SegmentedTabs({
  value,
  items,
  ariaLabel,
  onChange,
  className,
  fullWidth = false,
  iconOnly = false,
  size = 'md',
}: SegmentedTabsProps) {
  const rootSizeClass = size === 'sm' ? 'gap-0.5 p-0.5' : 'gap-1 p-1'
  const itemSizeClass = size === 'sm' ? 'px-3 text-xs' : 'px-4 text-sm'
  const rootClass = `${fullWidth ? 'flex w-full' : 'inline-flex max-w-full'} overflow-x-auto border border-slate-200 bg-slate-100/80 ${rootSizeClass} ${className || ''}`.trim()
  const itemClass = (active: boolean, disabled?: boolean) =>
    `${fullWidth ? 'flex-1' : ''} flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border font-medium outline-none transition-colors focus-visible:border-primary-400 ${itemSizeClass} ${
      active
        ? 'border-slate-200 bg-white text-primary-700 shadow-sm'
        : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-800'
    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`.trim()

  return (
    <div className={rootClass} role="tablist" aria-label={ariaLabel} style={{ borderRadius: 'var(--radius)' }}>
      {items.map((item) => {
        const active = item.value === value
        const content = <>{item.icon}{iconOnly ? <span className="sr-only">{item.label}</span> : item.label}</>
        const common = {
          role: 'tab' as const,
          'aria-selected': active,
          'aria-label': iconOnly && typeof item.label === 'string' ? item.label : undefined,
          className: itemClass(active, item.disabled),
          style: { height: size === 'sm' ? 'var(--control-height-sm)' : 'var(--control-height)', borderRadius: 'var(--radius)' },
        }
        const control = item.href ? (
          <Link {...common} href={item.href} aria-current={active ? 'page' : undefined}
            onClick={(event) => {
              if (item.disabled) {
                event.preventDefault()
                return
              }
              onChange?.(item.value)
            }}>
            {content}
          </Link>
        ) : (
          <button {...common} type="button" disabled={item.disabled} onClick={() => onChange?.(item.value)}>
            {content}
          </button>
        )
        return iconOnly ? <Tooltip key={item.value} content={item.label}>{control}</Tooltip> : <span key={item.value} className={fullWidth ? 'flex min-w-0 flex-1' : 'contents'}>{control}</span>
      })}
    </div>
  )
}
