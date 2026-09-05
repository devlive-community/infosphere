import { useEffect, useRef, useState, ReactNode, KeyboardEvent } from 'react'
import { useRouter } from 'next/router'
import { API_BASE, getToken } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Input, Textarea, Select } from '@/components/ui'
import { BookIcon, CheckCircleIcon, ImageIcon, LinkIcon, UploadIcon } from '@/components/icons'
import type { Book, BookStatus } from '@/lib/types'

const MAX_TITLE = 60
const MAX_DESC = 200
const MAX_TAGS = 10
const validSlug = (s: string) => /^[a-z0-9-]+$/.test(s)

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
]
const prefixOptions = [
  { value: '', label: '不使用前缀' },
  { value: '第', label: '第（第一章、第二章…）' },
  { value: 'Chapter ', label: 'Chapter （Chapter 1…）' },
]
const statusNames: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' }

export interface BookFormProps {
  initial?: Book
  heading: string
  subheading: string
  breadcrumb: string
  submitLabel: string
  showSaveDraft?: boolean
  onSubmit: (payload: Record<string, unknown>) => Promise<void>
}

// 书籍表单：创建与设置页共用，双栏（分区表单 + 实时预览）
export default function BookForm({ initial, heading, subheading, breadcrumb, submitLabel, showSaveDraft, onSubmit }: BookFormProps) {
  const router = useRouter()
  const { user } = useApp()
  const isEdit = !!initial

  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [coverImage, setCoverImage] = useState(initial?.cover_image || '')
  const [slug, setSlug] = useState(initial?.slug || '')
  const [status, setStatus] = useState<BookStatus>(initial?.status || 'draft')
  const [isPublic, setIsPublic] = useState(initial?.is_public || false)
  const [chapterPrefix, setChapterPrefix] = useState(initial?.chapter_prefix || '')
  const [tags, setTags] = useState<string[]>((initial?.tags || []).map((t) => t.name))
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [host, setHost] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setHost(window.location.host) }, [])

  const coverSrc = coverImage ? (/^https?:\/\//.test(coverImage) ? coverImage : API_BASE + coverImage) : ''
  const authorName = user?.username || '你'
  const authorAvatar = user?.avatar ? (/^https?:\/\//.test(user.avatar) ? user.avatar : API_BASE + user.avatar) : ''

  function addTag() {
    const t = tagInput.trim()
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) { setTagInput(''); return }
    setTags([...tags, t]); setTagInput('')
  }
  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
    else if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1))
  }

  async function uploadCover(file: File | undefined) {
    if (!file) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_BASE}/api/v1/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload.success === false) throw new Error(payload.message || '上传失败')
      setCoverImage(payload.data.url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function submit(overrideStatus?: BookStatus) {
    setError('')
    if (!title.trim()) { setError('请填写书籍标题'); return }
    if (slug && !validSlug(slug)) { setError('访问路径仅支持小写字母、数字和中划线'); return }
    setSaving(true)
    try {
      await onSubmit({
        title: title.trim(),
        description,
        cover_image: coverImage,
        slug: slug || undefined,
        status: overrideStatus ?? status,
        is_public: isPublic,
        chapter_prefix: chapterPrefix,
        tags,
      })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="pb-24">
      {/* 页头 */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav className="mb-1 flex items-center gap-1.5 text-sm text-slate-400">
            <button onClick={() => router.push('/books')} className="hover:text-primary-600">我的书籍</button>
            <span>/</span>
            <span className="text-slate-500">{breadcrumb}</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
          <p className="mt-1 text-sm text-slate-500">{subheading}</p>
        </div>
        <div className="flex items-center gap-3">
          {showSaveDraft && (
            <button onClick={() => submit('draft')} disabled={saving}
              className="text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50">
              保存为草稿
            </button>
          )}
          <Button onClick={() => submit()} loading={saving}>{submitLabel}</Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* 左：分区表单 */}
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* 基本信息 */}
          <Section icon={<BookIcon className="h-4 w-4" />} title="基本信息">
            <RowField label={<>书籍标题 <span className="text-rose-500">*</span></>}>
              <div className="relative">
                <Input value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} placeholder="给你的书起个名字"
                  className="pr-16" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{title.length} / {MAX_TITLE}</span>
              </div>
            </RowField>
            <RowField label="一句话简介">
              <div className="relative">
                <Textarea value={description} maxLength={MAX_DESC} onChange={(e) => setDescription(e.target.value)}
                  placeholder="用一句话描述这本书的方向" className="min-h-[76px] pb-6" />
                <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-slate-400">{description.length} / {MAX_DESC}</span>
              </div>
            </RowField>
            <RowField label="标签" hint={`最多添加 ${MAX_TAGS} 个标签`}>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-colors focus-within:border-primary-500">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200">
                    {t}
                    <button type="button" aria-label={`移除 ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="text-primary-400 hover:text-primary-700">×</button>
                  </span>
                ))}
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={onTagKey} onBlur={addTag}
                  placeholder={tags.length >= MAX_TAGS ? '已达上限' : '添加标签，按回车确认'} disabled={tags.length >= MAX_TAGS}
                  className="min-w-[140px] flex-1 border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-0" />
              </div>
            </RowField>
          </Section>

          {/* 封面 */}
          <Section icon={<ImageIcon className="h-4 w-4" />} title="封面">
            <div className="flex gap-4">
              <div className="h-36 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-primary-200 to-[#8B8DFF]">
                {coverSrc && <img src={coverSrc} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 py-6 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40 disabled:opacity-60">
                  <UploadIcon className="h-5 w-5 text-slate-400" />
                  <span className="text-sm font-medium text-slate-600">{uploading ? '上传中…' : '上传封面图片'}</span>
                  <span className="text-xs text-slate-400">建议尺寸 1200 × 1600，支持 JPG、PNG</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = '' }} />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">或粘贴图片地址</span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>
                <div className="flex gap-2">
                  <Input value={/^https?:\/\//.test(coverImage) ? coverImage : ''} onChange={(e) => setCoverImage(e.target.value)}
                    placeholder="https://example.com/cover.jpg" />
                  {coverImage && (
                    <Button variant="outline" type="button" onClick={() => setCoverImage('')} className="shrink-0">移除封面</Button>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* 访问与章节 */}
          <Section icon={<LinkIcon className="h-4 w-4" />} title="访问与章节">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">访问路径</label>
                <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-slate-200 focus-within:border-primary-500">
                  <span className="flex items-center whitespace-nowrap bg-slate-50 px-3 text-xs text-slate-400">{host || 'infosphere'}/book/</span>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={isEdit}
                    placeholder="knowledge-garden"
                    className="min-w-0 flex-1 border-0 bg-white px-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:bg-slate-50 disabled:text-slate-400" />
                </div>
                <p className={`mt-1.5 text-xs ${!slug ? 'text-slate-400' : validSlug(slug) ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {isEdit ? '访问路径创建后不可修改' : !slug ? '留空将根据标题自动生成' : validSlug(slug) ? '该路径可用' : '仅支持小写字母、数字和中划线'}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">章节前缀</label>
                <Select value={chapterPrefix} onChange={setChapterPrefix} options={prefixOptions} />
                <p className="mt-1.5 text-xs text-slate-400">用于章节标题前的统一前缀</p>
              </div>
            </div>
          </Section>

          {/* 发布设置 */}
          <Section icon={<SlidersIcon className="h-4 w-4" />} title="发布设置">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <VisibilityCard active={!isPublic} onClick={() => setIsPublic(false)}
                icon={<LockIcon className="h-5 w-5" />} title="仅自己可见" desc="适合尚未完成的内容" />
              <VisibilityCard active={isPublic} onClick={() => setIsPublic(true)}
                icon={<GlobeIcon className="h-5 w-5" />} title="公开访问" desc="所有访客都可以阅读" />
            </div>
            <div className="mt-4 max-w-xs">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">初始状态</label>
              <Select value={status} onChange={(v) => setStatus(v as BookStatus)} options={statusOptions} />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-primary-50/70 px-3 py-2.5 text-sm text-primary-700">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{isEdit ? '保存后可继续在章节编辑页调整这些设置。' : '创建后将进入章节编辑页，你可以随时调整这些设置。'}</span>
            </div>
          </Section>
        </div>

        {/* 右：实时预览 */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-bold text-slate-900">实时预览</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="aspect-[4/3] w-full bg-gradient-to-br from-primary-200 to-[#8B8DFF]">
                {coverSrc && <img src={coverSrc} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
              </div>
              <div className="space-y-2 p-4">
                {tags.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">{tags[0]}</span>
                )}
                <h3 className="line-clamp-2 text-lg font-bold text-slate-900">{title || '书名将显示在这里'}</h3>
                <p className="line-clamp-3 text-sm text-slate-500">{description || '一句话简介会显示在这里。'}</p>
                <div className="flex items-center gap-2 pt-1">
                  {authorAvatar
                    ? <img src={authorAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                    : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">{authorName.slice(0, 1)}</span>}
                  <span className="text-sm text-slate-600">{authorName}</span>
                </div>
                <div className="flex items-center gap-1.5 pt-1 text-xs text-slate-400">
                  <LockIcon className="h-3.5 w-3.5" />
                  {isPublic ? '公开访问' : '仅自己可见'} · {statusNames[status]}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-bold text-slate-900">{isEdit ? '你可以' : '创建后你可以'}</h2>
            <ul className="space-y-3 text-sm text-slate-600">
              {['添加并组织章节', '使用 Markdown 写作', '预览并发布内容'].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <CheckCircleIcon className="h-5 w-5 text-emerald-500" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* 底部操作条 */}
      <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <span className="text-sm text-slate-400">所有内容都可以稍后修改</span>
        <div className="flex items-center gap-3">
          <Button variant="outline" type="button" onClick={() => router.back()}>取消</Button>
          <Button onClick={() => submit()} loading={saving}>{submitLabel}</Button>
        </div>
      </div>
    </div>
  )
}

/* ── 子组件 ── */

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">{icon}</span>
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function RowField({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[84px_minmax(0,1fr)] sm:gap-3">
      <label className="pt-2 text-sm font-medium text-slate-700">{label}</label>
      <div>
        {children}
        {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  )
}

function VisibilityCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
        active ? 'border-primary-500 bg-primary-50/60 ring-1 ring-inset ring-primary-200' : 'border-slate-200 hover:border-slate-300'
      }`}>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-primary-500' : 'border-slate-300'}`}>
        {active && <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />}
      </span>
      <span className={active ? 'text-primary-600' : 'text-slate-400'}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{desc}</span>
      </span>
    </button>
  )
}

/* 局部图标（图标库未收录） */
function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" />
    </svg>
  )
}
function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </svg>
  )
}
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
    </svg>
  )
}
