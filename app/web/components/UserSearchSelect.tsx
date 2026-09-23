import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Input } from '@/components/ui'
import UserAvatar from '@/components/UserAvatar'

export interface UserLite { id: number; username: string; nickname?: string; email?: string; avatar?: string }

// UserSearchSelect 通用「可搜索用户选择器」（后台）：输入用户名/邮箱关键字实时查 /admin/users 并下拉候选，点选即回调。
// 下拉经 Portal 挂到 body，避免被 Modal/overflow 容器裁剪（与 BookSearchSelect 一致）。
export default function UserSearchSelect({
  value,
  onChange,
  placeholder,
}: {
  value: UserLite | null
  onChange: (user: UserLite | null) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(value?.username || '')
  const [results, setResults] = useState<UserLite[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => { setQuery(value?.username || '') }, [value])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const update = () => {
      const r = boxRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open, results.length, loading])

  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => {
      setLoading(true)
      api<{ items: UserLite[] }>('/admin/users', { params: { q: query.trim(), page_size: 20 } })
        .then((r) => setResults(r.items || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(h)
  }, [query, open])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      if (!boxRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <Input value={query}
        onChange={(e) => { setQuery(e.target.value); if (value) onChange(null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || t('common.user.searchPlaceholder')} />
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} className="fixed z-[200] max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-400">{t('common.user.searching')}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{t('common.user.noResult')}</div>
          ) : (
            results.map((u) => (
              <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(u); setQuery(u.username); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                <UserAvatar user={u} size="h-6 w-6" link={false} tooltip={false} />
                <span className="min-w-0 truncate">{u.username}{u.nickname ? <span className="text-slate-400"> · {u.nickname}</span> : null}</span>
                {u.email && <span className="ml-auto shrink-0 truncate text-xs text-slate-400">{u.email}</span>}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
