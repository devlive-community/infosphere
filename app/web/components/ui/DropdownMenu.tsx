import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from './Tooltip'

interface DropdownMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  label?: string
}

interface MenuPosition {
  top: number
  left: number
}

const MENU_GAP = 8
const VIEWPORT_GAP = 8

// DropdownMenu 使用 Portal 渲染菜单，避免被卡片 overflow-hidden 裁切。
export default function DropdownMenu({ open, onOpenChange, children, label = '更多操作' }: DropdownMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const triggerRect = trigger.getBoundingClientRect()
    const menuWidth = menu.offsetWidth
    const menuHeight = menu.offsetHeight
    const bottomTop = triggerRect.bottom + MENU_GAP
    const topTop = triggerRect.top - menuHeight - MENU_GAP
    const canOpenBelow = bottomTop + menuHeight <= window.innerHeight - VIEWPORT_GAP
    const preferAbove = !canOpenBelow && triggerRect.top > window.innerHeight - triggerRect.bottom
    const desiredTop = preferAbove ? topTop : bottomTop

    setPosition({
      top: Math.min(window.innerHeight - menuHeight - VIEWPORT_GAP, Math.max(VIEWPORT_GAP, desiredTop)),
      left: Math.min(
        window.innerWidth - menuWidth - VIEWPORT_GAP,
        Math.max(VIEWPORT_GAP, triggerRect.right - menuWidth),
      ),
    })
  }, [])

  useEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const frame = window.requestAnimationFrame(updatePosition)
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') onOpenChange(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, onOpenChange, updatePosition])

  const layer = open && typeof document !== 'undefined' && createPortal(
    <>
      <button type="button" aria-label="关闭菜单" className="fixed inset-0 z-[110] cursor-default" onClick={() => onOpenChange(false)} />
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        className="fixed z-[120] w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          visibility: position ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  )

  return (
    <span className="inline-flex">
      <Tooltip content={label} disabled={open}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className={`flex items-center justify-center rounded-lg transition-colors ${open ? 'bg-primary-50 text-primary-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
          style={{ width: 'var(--control-height-sm)', height: 'var(--control-height-sm)' }}
        >
          <i className="fa-solid fa-ellipsis" aria-hidden="true" />
        </button>
      </Tooltip>
      {layer}
    </span>
  )
}
