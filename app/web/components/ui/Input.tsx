import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'

// 输入类控件的基础样式：无 focus 外圈阴影，仅边框颜色变化
const controlClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 transition-colors hover:border-slate-300 ' +
  'focus:border-primary-500 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

// Input 通用文本输入框
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-10 ${controlClass} ${className || ''}`.trim()} {...rest} />
}

// Textarea 通用多行文本域
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-[96px] py-2.5 ${controlClass} ${className || ''}`.trim()} {...rest} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[]
}

// Select 通用下拉选择：原生 select + 自绘箭头
export function Select({ options, className, ...rest }: SelectProps) {
  return (
    <div className={`relative ${className || ''}`.trim()}>
      <select className={`h-10 appearance-none pr-9 ${controlClass}`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
        <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}

// Field 表单字段容器：统一 label 与控件的排版
export function Field({ label, hint, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
