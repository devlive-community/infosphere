import { useState, FormEvent } from 'react'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { Button, Input, Textarea, Select, Field } from '@/components/ui'
import TagChips from '@/components/TagChips'
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
  const [tags, setTags] = useState((initial?.tags || []).map((t) => t.name).join(', '))
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
        tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white shadow-sm max-w-2xl p-6">
      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}
      <div className="space-y-4">
        <Field label="标题 *">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="简介">
          <Textarea className="min-h-[90px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="访问路径 slug（留空自动生成）">
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-book" disabled={!!initial} />
          </Field>
          <Field label="章节前缀（如「第」、「Chapter 」）">
            <Input value={chapterPrefix} onChange={(e) => setChapterPrefix(e.target.value)} />
          </Field>
        </div>
        <Field label="封面图片 URL">
          <Input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="标签" hint="多个标签用逗号分隔，最多 10 个；不存在的标签会自动创建">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Go, 后端, 设计" />
        </Field>
        <div className="flex gap-6">
          <div className="flex-1">
            <Field label="状态">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as BookStatus)}
                options={[
                  { value: 'draft', label: '草稿' },
                  { value: 'published', label: '已发布' },
                  { value: 'archived', label: '已归档' },
                ]}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="可见性">
              <label className="flex h-[42px] items-center gap-2 rounded-lg border border-slate-300 px-3">
                <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                <span className="text-sm">公开可访问</span>
              </label>
            </Field>
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" type="button" onClick={() => router.back()}>取消</Button>
        <Button type="submit" loading={saving}>{submitLabel}</Button>
      </div>
    </form>
  )
}
