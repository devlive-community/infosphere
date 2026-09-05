import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'

// Input 通用文本输入框
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className || ''}`.trim()} {...rest} />
}

// Textarea 通用多行文本域
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className || ''}`.trim()} {...rest} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[]
}

// Select 通用下拉选择
export function Select({ options, className, ...rest }: SelectProps) {
  return (
    <select className={`input ${className || ''}`.trim()} {...rest}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
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
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
