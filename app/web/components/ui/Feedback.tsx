import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'

type ToastTone = 'success' | 'error' | 'info'

interface ToastOptions {
  title?: string
  message: string
  tone?: ToastTone
}

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface InputOptions {
  title: string
  message?: string
  label: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
}

interface FeedbackContextValue {
  showToast: (options: ToastOptions | string) => void
  confirmAction: (options: ConfirmOptions) => Promise<boolean>
  requestInput: (options: InputOptions) => Promise<string | null>
}

interface ToastItem extends Required<Pick<ToastOptions, 'message' | 'tone'>> {
  id: number
  title?: string
}

type ActiveDialog =
  | ({ kind: 'confirm'; resolve: (value: boolean) => void } & ConfirmOptions)
  | ({ kind: 'input'; resolve: (value: string | null) => void } & InputOptions)

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dialog, setDialog] = useState<ActiveDialog | null>(null)
  const [inputValue, setInputValue] = useState('')
  const nextToastId = useRef(1)
  const inputRef = useRef<HTMLInputElement>(null)

  const showToast = useCallback((options: ToastOptions | string) => {
    const normalized = typeof options === 'string' ? { message: options } : options
    const item: ToastItem = {
      id: nextToastId.current++,
      message: normalized.message,
      title: normalized.title,
      tone: normalized.tone || 'info',
    }
    setToasts((current) => [...current.slice(-2), item])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== item.id)), 4200)
  }, [])

  const confirmAction = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setDialog({ kind: 'confirm', ...options, resolve })
  }), [])

  const requestInput = useCallback((options: InputOptions) => new Promise<string | null>((resolve) => {
    setInputValue(options.defaultValue || '')
    setDialog({ kind: 'input', ...options, resolve })
  }), [])

  const closeDialog = useCallback((confirmed: boolean) => {
    if (!dialog) return
    setDialog(null)
    if (dialog.kind === 'confirm') dialog.resolve(confirmed)
    else dialog.resolve(confirmed ? inputValue.trim() : null)
  }, [dialog, inputValue])

  useEffect(() => {
    if (!dialog) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDialog(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [dialog, closeDialog])

  return (
    <FeedbackContext.Provider value={{ showToast, confirmAction, requestInput }}>
      {children}

      <div className="pointer-events-none fixed inset-x-4 top-4 z-[160] flex flex-col items-end gap-2 sm:left-auto sm:w-[380px]" aria-live="polite">
        {toasts.map((toast) => {
          const tone = toast.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : toast.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-primary-200 bg-primary-50 text-primary-700'
          const icon = toast.tone === 'success' ? 'fa-circle-check' : toast.tone === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'
          return (
            <div key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${tone}`}>
              <i className={`fa-solid ${icon} mt-0.5 shrink-0`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {toast.title && <p className="font-semibold">{toast.title}</p>}
                <p className="max-h-28 overflow-y-auto break-words text-sm leading-5">{toast.message}</p>
              </div>
              <button type="button" aria-label="关闭提示" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-60 transition-colors hover:bg-black/5 hover:opacity-100">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(false) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title"
            className="flex max-h-[min(86vh,560px)] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="flex items-start gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${dialog.kind === 'confirm' && dialog.danger ? 'bg-rose-50 text-rose-600' : 'bg-primary-50 text-primary-600'}`}>
                <i className={`fa-solid ${dialog.kind === 'confirm' && dialog.danger ? 'fa-triangle-exclamation' : dialog.kind === 'input' ? 'fa-pen' : 'fa-circle-question'}`} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="feedback-dialog-title" className="text-lg font-bold text-slate-900">{dialog.title}</h2>
                {dialog.message && <p className="mt-1 break-words text-sm leading-6 text-slate-500">{dialog.message}</p>}
              </div>
              <button type="button" aria-label="关闭" onClick={() => closeDialog(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
            {dialog.kind === 'input' && (
              <form className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6" onSubmit={(event) => { event.preventDefault(); if (inputValue.trim()) closeDialog(true) }}>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="feedback-dialog-input">{dialog.label}</label>
                <Input ref={inputRef} id="feedback-dialog-input" value={inputValue} placeholder={dialog.placeholder}
                  onChange={(event) => setInputValue(event.target.value)} />
              </form>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
              <Button type="button" variant="ghost" onClick={() => closeDialog(false)}>{dialog.kind === 'confirm' ? dialog.cancelLabel || '取消' : '取消'}</Button>
              <Button type="button" variant={dialog.kind === 'confirm' && dialog.danger ? 'danger' : 'primary'}
                disabled={dialog.kind === 'input' && !inputValue.trim()} onClick={() => closeDialog(true)}>
                {dialog.kind === 'confirm' ? dialog.confirmLabel || '确认' : dialog.confirmLabel || '确定'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext)
  if (!context) throw new Error('useFeedback 必须在 FeedbackProvider 内使用')
  return context
}
