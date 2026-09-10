import { ButtonHTMLAttributes, KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Point {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

const VIEWPORT_GAP = 8

export function fitContextMenuPosition(
  anchor: Point,
  menu: Size,
  viewport: Size,
  gap = VIEWPORT_GAP,
  align: 'start' | 'end' = 'start',
  flipY = anchor.y,
): Point {
  const preferredLeft = align === 'end' ? anchor.x - menu.width : anchor.x
  const left = preferredLeft + menu.width <= viewport.width - gap
    ? preferredLeft
    : anchor.x - menu.width
  const top = anchor.y + menu.height <= viewport.height - gap
    ? anchor.y
    : flipY - menu.height
  const maxLeft = Math.max(gap, viewport.width - menu.width - gap)
  const maxTop = Math.max(gap, viewport.height - menu.height - gap)
  return {
    x: Math.min(maxLeft, Math.max(gap, left)),
    y: Math.min(maxTop, Math.max(gap, top)),
  }
}

interface ContextMenuProps {
  open: boolean
  x: number
  y: number
  onClose: () => void
  children: ReactNode
  label?: string
  className?: string
  align?: 'start' | 'end'
  flipY?: number
}

// ContextMenu 使用鼠标坐标定位，并通过 Portal 脱离目录等滚动容器。
export default function ContextMenu({ open, x, y, onClose, children, label = '上下文菜单', className, align = 'start', flipY }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Point | null>(null)

  useEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    setPosition(null)
    const frame = window.requestAnimationFrame(() => {
      const menu = menuRef.current
      if (!menu) return
      setPosition(fitContextMenuPosition(
        { x, y },
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        VIEWPORT_GAP,
        align,
        flipY,
      ))
    })
    function closeOnPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    function closeOnKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', closeOnPointer, true)
    window.addEventListener('keydown', closeOnKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOnPointer, true)
      window.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [open, x, y, onClose, align, flipY])

  useEffect(() => {
    if (!position) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [position])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') || [])
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[(current + step + items.length) % items.length].focus()
  }

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div ref={menuRef} role="menu" aria-label={label} onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      className={`fixed z-[120] w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl ${className || ''}`.trim()}
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}>
      {children}
    </div>,
    document.body,
  )
}

interface ContextMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean
}

export function ContextMenuItem({ danger = false, className, children, ...props }: ContextMenuItemProps) {
  return (
    <button type="button" role="menuitem" {...props}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors ${
        danger
          ? 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50'
          : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-50'
      } disabled:cursor-not-allowed disabled:opacity-40 ${className || ''}`.trim()}>
      {children}
    </button>
  )
}
