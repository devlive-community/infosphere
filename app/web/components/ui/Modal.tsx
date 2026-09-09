import { ReactNode, useEffect, useRef } from 'react'
import { CloseIcon } from '@/components/icons'
import Tooltip from './Tooltip'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={ref} className={`relative mx-0 flex max-h-[calc(100vh-1rem)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:mx-4 sm:rounded-2xl ${className || ''}`}
        style={{ borderRadius: 'var(--radius)' }}>
        {title && (
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <Tooltip content="关闭弹窗">
              <button type="button" aria-label="关闭弹窗" onClick={onClose} className="flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                style={{ width: 'var(--control-height)', height: 'var(--control-height)', borderRadius: 'var(--radius)' }}>
                <CloseIcon className="h-5 w-5" />
              </button>
            </Tooltip>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}
