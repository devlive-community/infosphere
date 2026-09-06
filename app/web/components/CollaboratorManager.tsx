import { useCallback, useEffect, useState, FormEvent } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Input, Select, Badge, EmptyState } from '@/components/ui'
import UserAvatar from '@/components/UserAvatar'
import type { Book, User } from '@/lib/types'

interface Collaborator {
  id: number
  user_id: number
  role: 'editor' | 'viewer'
  created_at: string
  user?: Pick<User, 'id' | 'username' | 'avatar'>
}

const ROLE_LABELS: Record<string, string> = { editor: '编辑者', viewer: '访问者' }

// CollaboratorManager 书籍设置页的协作者管理：所有者可增删，协作者可查看与自己退出
export default function CollaboratorManager({ book }: { book: Book }) {
  const { user } = useApp()
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loaded, setLoaded] = useState(false)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('editor')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const isOwner = user?.id === book.user_id

  const load = useCallback(async () => {
    try {
      const data = await api<{ collaborators: Collaborator[] }>(`/books/${book.id}/collaborators`)
      setCollaborators(data.collaborators || [])
    } catch { /* 无权查看时静默 */ }
    setLoaded(true)
  }, [book.id])

  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!username.trim()) return
    setWorking(true)
    setMessage('')
    setError('')
    try {
      await api(`/books/${book.id}/collaborators`, { method: 'POST', body: { username: username.trim(), role } })
      setMessage(`已添加 ${ROLE_LABELS[role]}协作者「${username.trim()}」，对方会收到通知`)
      setUsername('')
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function remove(userId: number, name: string) {
    const self = user?.id === userId
    if (!confirm(self ? `确定退出《${book.title}》的协作吗？` : `确定移除协作者「${name}」吗？`)) return
    setWorking(true)
    setMessage('')
    setError('')
    try {
      await api(`/books/${book.id}/collaborators/${userId}`, { method: 'DELETE' })
      setMessage(self ? '已退出协作' : `已移除「${name}」`)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
      <h2 className="font-semibold text-slate-900">协作者管理</h2>
      <p className="mt-1 text-sm text-slate-500">
        {isOwner
          ? '邀请其他用户协作：编辑者可管理章节内容，访问者仅可阅读这本私有书籍。'
          : '编辑者可管理章节内容，访问者仅可阅读这本私有书籍。'}
      </p>
      {message && <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

      {loaded && collaborators.length === 0 ? (
        <div className="mt-4">
          <EmptyState>还没有协作者，通过下方输入框邀请</EmptyState>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-3">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar user={{ username: c.user?.username || '?', avatar: c.user?.avatar || '' }} size="h-9 w-9" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{c.user?.username}</div>
                  <span className="mt-0.5 inline-block">
                    <Badge tone={c.role === 'editor' ? 'emerald' : 'slate'}>{ROLE_LABELS[c.role]}</Badge>
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="sm" loading={working}
                onClick={() => remove(c.user_id, c.user?.username || '')}>
                {user?.id === c.user_id ? '退出' : '移除'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <form onSubmit={add} className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
          <Input className="flex-1" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="对方用户名" />
          <Select
            className="sm:w-32"
            options={[{ value: 'editor', label: '编辑者' }, { value: 'viewer', label: '访问者' }]}
            value={role} onChange={setRole} />
          <Button type="submit" loading={working}>添加协作者</Button>
        </form>
      )}
    </div>
  )
}
