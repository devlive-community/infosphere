import {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react'

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

// Textarea 通用多行文本域（forwardRef 供编辑器操作选区）
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={`py-2.5 ${controlClass} ${className || ''}`.trim()} {...rest} />
  },
)

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

// Select 自绘下拉选择：触发按钮 + 浮层选项列表（不使用原生 select）
export function Select({ options, value, onChange, className, placeholder, disabled }: SelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`relative ${className || ''}`.trim()} ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`flex h-10 items-center justify-between gap-2 text-left ${controlClass}`}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label || placeholder || '请选择'}</span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o) => {
            const active = o.value === value
            return (
              <li key={o.value}>
                <button type="button" onClick={() => { onChange?.(o.value); setOpen(false) }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    active ? 'bg-primary-50 font-medium text-primary-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}>
                  <span className="truncate">{o.label}</span>
                  {active && (
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600">
                      <path d="m5 10 3.5 3.5L15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
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
