import { useState, FormEvent } from 'react'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import type { Book, BookStatus } from '@/lib/types'

export interface BookFormProps {
  initial?: Book
  submitLabel: string
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}

// 书籍表单：创建与设置页共用
export default function BookForm({ initial, submitLabel, onSubmit }: BookFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [coverImage, setCoverImage] = useState(initial?.cover_image || '')
  const [slug, setSlug] = useState(initial?.slug || '')
  const [status, setStatus] = useState<BookStatus>(initial?.status || 'draft')
  const [isPublic, setIsPublic] = useState(initial?.is_public || false)
  const [chapterPrefix, setChapterPrefix] = useState(initial?.chapter_prefix || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('请填写书籍标题')
    setSaving(true)
    try {
      await onSubmit({
        title: title.trim(),
        description,
        cover_image: coverImage,
        slug: slug || undefined,
        status,
        is_public: isPublic,
        chapter_prefix: chapterPrefix,
      })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl p-6">
      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
      <div className="space-y-4">
        <div>
          <label className="label">标题 *</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">简介</label>
          <textarea className="input min-h-[90px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">访问路径 slug（留空自动生成）</label>
            <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-book" disabled={!!initial} />
          </div>
          <div>
            <label className="label">章节前缀（如「第」、「Chapter 」）</label>
            <input className="input" value={chapterPrefix} onChange={(e) => setChapterPrefix(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">封面图片 URL</label>
          <input className="input" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." />
        </div>
        <div className="flex gap-6">
          <div className="flex-1">
            <label className="label">状态</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="archived">已归档</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="label">可见性</label>
            <label className="flex h-[42px] items-center gap-2 rounded-lg border border-slate-300 px-3">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              <span className="text-sm">公开可访问</span>
            </label>
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn-outline" onClick={() => router.back()}>取消</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? '保存中…' : submitLabel}</button>
      </div>
    </form>
  )
}
