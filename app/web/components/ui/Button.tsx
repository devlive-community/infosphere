import { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react'
import Link from 'next/link'

type Variant = 'primary' | 'outline' | 'danger' | 'ghost'

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  danger: 'btn-danger',
  ghost: 'btn text-slate-600 hover:bg-slate-100',
}

interface CommonProps {
  variant?: Variant
  loading?: boolean
  className?: string
}

function classes({ variant = 'primary', className }: { variant?: Variant; className?: string }) {
  return `${variantClass[variant]} ${className || ''}`.trim()
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, CommonProps {}

// Button 通用按钮；loading 时自动禁用并切换文案状态
export function Button({ variant, loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button className={classes({ variant, className })} disabled={disabled || loading} {...rest}>
      {loading ? '处理中…' : children}
    </button>
  )
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement>, CommonProps {
  href: string
  external?: boolean
}

// ButtonLink 路由跳转样式的按钮（内部走 next/link，外链走 <a>）
export function ButtonLink({ href, external, variant, children, className, ...rest }: ButtonLinkProps) {
  const cls = classes({ variant, className })
  if (external || /^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>{children}</a>
    )
  }
  return (
    <Link href={href} className={cls} {...rest}>{children}</Link>
  )
}
