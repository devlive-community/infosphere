interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel?: string
  disabled?: boolean
}

// Checkbox 通用复选框：纯视觉自定义，用 <button role="checkbox"> 替代原生 input，
// 颜色跟随主题 primary 色阶，圆角跟随 --radius。
export function Checkbox({ checked, onChange, ariaLabel, disabled }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? 'border-primary-600 bg-primary-500'
          : 'border-slate-300 bg-white'
      }`}
    >
      {checked && (
        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2.5 6 5 8.5 9.5 3.5" />
        </svg>
      )}
    </button>
  )
}
