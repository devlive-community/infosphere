import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import UserAvatar from '@/components/UserAvatar'
import { formatDate } from '@/lib/api'
import { useApp } from '@/lib/auth'
import type { User } from '@/lib/types'

interface CommentItem {
  id: number
  content: string
  created_at: string
  user: { username: string; avatar?: string }
  replies?: CommentItem[]
}

// Comments 章节评论区（两级）
export default function Comments({ docId }: { docId: number }) {
  const { user } = useApp()
  const [comments, setComments] = useState<CommentItem[] | null>(null)
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    try {
      setComments(await api<CommentItem[]>(`/documents/${docId}/comments`))
    } catch (e) {
      setComments([])
    }
  }

  useEffect(() => { load() }, [docId])

  async function submit(e: FormEvent, parentId?: number) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api(`/documents/${docId}/comments`, {
        method: 'POST',
        body: { content, parent_id: parentId },
      })
      setContent('')
      setReplyTo(null)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('确定删除该评论吗？')) return
    try {
      await api(`/comments/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const canComment = !!user

  function CommentNode({ comment }: { comment: CommentItem }) {
    return (
      <div className="flex gap-3 py-3">
        <UserAvatar user={comment.user} size="h-8 w-8 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-900">{comment.user?.username || '佚名'}</span>
            <span className="text-xs text-slate-400">{formatDate(comment.created_at)}</span>
            {user?.id === (comment as any).user_id && (
              <button onClick={() => remove(comment.id)} className="text-xs text-rose-400 hover:text-rose-600">删除</button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.content}</p>
          {user && (
            <button onClick={() => setReplyTo(comment.id)} className="mt-1 text-xs text-slate-400 hover:text-primary-600">回复</button>
          )}
          {(comment.replies || []).length > 0 && (
            <div className="mt-2 space-y-3 border-l border-slate-100 pl-4">
              {(comment.replies || []).map((r) => (
                <div key={r.id} className="flex gap-3">
                  <UserAvatar user={r.user} size="h-7 w-7" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-900">{r.user?.username}</span>
                      <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="border-t border-slate-200 pt-8">
      <h2 className="text-xl font-bold text-slate-900">评论</h2>

      {user ? (
        <form onSubmit={(e) => submit(e, replyTo ?? undefined)} className="mt-4">
          {replyTo && (
            <p className="mb-2 text-xs text-slate-400">
              回复 #{replyTo} <button type="button" onClick={() => setReplyTo(null)} className="text-primary-600 hover:underline">取消</button>
            </p>
          )}
          <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000}
            placeholder="写下你的想法…" className="min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-primary-500 focus:outline-none" />
          {error && <p className="mt-1 text-sm text-rose-500">{error}</p>}
          <div className="mt-2 flex justify-end">
            <button type="submit" disabled={submitting || !content.trim()}
              className="h-9 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? '发表中…' : '发表评论'}
            </button>
          </div>
        </form>
      ) : (
        <p className="py-4 text-sm text-slate-400">
          <Link href="/login" className="text-primary-600 hover:underline">登录</Link>后参与评论
        </p>
      )}

      <div className="mt-6 divide-y divide-slate-100">
        {(comments || []).map((c) => <CommentNode key={c.id} comment={c} />)}
        {comments !== null && comments.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">还没有评论</p>
        )}
      </div>
    </section>
  )
}
