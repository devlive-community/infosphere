import { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react'
import Link from 'next/link'
import { ControlSize, sizedControlStyle } from './controlSize'

type Variant = 'primary' | 'outline' | 'danger' | 'ghost'

const baseClass =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ' +
  'focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const variantClass: Record<Variant, string> = {
  primary: 'bg-primary-500 text-white shadow-sm hover:bg-primary-600 active:bg-primary-700',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100',
  danger: 'bg-rose-500 text-white shadow-sm hover:bg-rose-600 active:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
}

const sizeClass: Record<ControlSize, string> = {
  sm: 'px-3 text-xs',
  md: 'px-4 text-[var(--control-text)]',
  lg: 'px-5 text-base',
}

function resolveClass(variant: Variant = 'primary', size: ControlSize = 'md', className?: string) {
  return `${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className || ''}`.trim()
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: ControlSize
  loading?: boolean
}

// Button 通用按钮；loading 时自动禁用并显示处理中状态
export function Button({ variant, size = 'md', loading, children, className, disabled, style, ...rest }: ButtonProps) {
  return (
    <button
      className={resolveClass(variant, size, className)}
      disabled={disabled || loading}
      {...rest}
      style={sizedControlStyle(size, style)}
    >
      {loading ? '处理中…' : children}
    </button>
  )
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  variant?: Variant
  size?: ControlSize
  external?: boolean
  disabled?: boolean
}

// ButtonLink 路由跳转样式的按钮（内部走 next/link，外链走 <a>；disabled 渲染为占位文本）
export function ButtonLink({ href, external, variant, size = 'md', children, className, disabled, style, ...rest }: ButtonLinkProps) {
  if (disabled) {
    return (
      <span aria-disabled className={`${resolveClass(variant, size, className)} cursor-not-allowed opacity-60`.trim()}
        style={sizedControlStyle(size, style)}>{children}</span>
    )
  }
  const cls = resolveClass(variant, size, className)
  if (external || /^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}
        style={sizedControlStyle(size, style)}>{children}</a>
    )
  }
  return (
    <Link href={href} className={cls} {...rest} style={sizedControlStyle(size, style)}>{children}</Link>
  )
}
