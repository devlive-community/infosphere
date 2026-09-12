import { useEffect, useState } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import { api, API_BASE, getToken } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Field, Select, Switch, Input, Loading, Checkbox, EmptyState, useFeedback } from '@/components/ui'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { DownloadIcon } from '@/components/icons'
import type { Book, PageResult } from '@/lib/types'

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', in_progress: '进行中', published: '已发布', completed: '已完成', archived: '已归档',
}

// BatchExportPanel 批量导出：勾选自有书籍，一次下载为外层 zip（内含每本自包含的 markdown zip）。
function BatchExportPanel() {
  const { showToast } = useFeedback()
  const [books, setBooks] = useState<Book[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<PageResult<Book>>('/books', { params: { scope: 'owned', page_size: 100 } })
      .then((d) => {
        const items = d.items || []
        setBooks(items)
        setSelected(new Set(items.map((b) => b.id)))
      })
      .catch(() => setBooks([]))
  }, [])

  const allSelected = books !== null && books.length > 0 && selected.size === books.length

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function download() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const ids = Array.from(selected).join(',')
      const token = getToken()
      const res = await fetch(`${API_BASE}/api/v1/users/me/export/books?ids=${ids}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const msg = await res.json().then((p) => p.message).catch(() => '')
        throw new Error(msg || '导出失败，请稍后重试')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `books-export-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast({ title: '导出失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900">批量导出</h2>
        <p className="mt-1 text-sm text-slate-500">选择你的书籍一次性下载。压缩包内每本书是独立的 Markdown zip，可单独重新导入。</p>
      </div>
      {books === null ? (
        <Loading className="py-16" label="正在加载书籍…" />
      ) : books.length === 0 ? (
        <EmptyState>你还没有创建书籍</EmptyState>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
            <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(books.map((b) => b.id)))}
              className="text-sm text-primary-600 hover:underline">
              {allSelected ? '清空选择' : '全选'}
            </button>
            <span className="text-xs text-slate-400">已选 {selected.size} / {books.length}</span>
          </div>
          <ul className="max-h-72 divide-y divide-slate-50 overflow-y-auto">
            {books.map((book) => (
              <li key={book.id}>
                <label className="flex cursor-pointer items-center gap-3 px-6 py-3 hover:bg-slate-50">
                  <Checkbox checked={selected.has(book.id)} onChange={() => toggle(book.id)} ariaLabel={`选择 ${book.title}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{book.title}</span>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-400">{STATUS_LABELS[book.status] || book.status}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-slate-100 px-6 py-4">
            <Button loading={busy} disabled={selected.size === 0} onClick={download}>
              <DownloadIcon className="h-4 w-4" /> 导出所选（{selected.size}）
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

interface ExportSettings {
  page_size: string
  include_cover: boolean
  include_toc: boolean
  font_size: number
  code_theme: string
  margin: string
  footer: string
}

const DEFAULTS: ExportSettings = { page_size: 'A4', include_cover: true, include_toc: true, font_size: 15, code_theme: 'light', margin: 'normal', footer: '' }

export default function ExportSettingsPage() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { showToast } = useFeedback()
  const [s, setS] = useState<ExportSettings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    api<ExportSettings>('/auth/export-settings').then((d) => setS({ ...DEFAULTS, ...d })).catch(() => {}).finally(() => setLoaded(true))
  }, [user])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载账户信息…" />

  async function save() {
    setSaving(true)
    try {
      await api('/auth/export-settings', { method: 'PUT', body: s })
      showToast({ title: '已保存', message: '导出样式已更新', tone: 'success' })
    } catch (e) {
      showToast({ title: '保存失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="账户设置" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">账户设置</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">账户设置</h1>
          <p className="mt-2 text-[15px] text-slate-500">管理你的个人信息与登录安全</p>
        </div>

        <AccountSettingsLayout user={user} active="export">
          <BatchExportPanel />
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-bold text-slate-900">导出设置</h2>
              <p className="mt-1 text-sm text-slate-500">导出书籍为 PDF 时的默认样式；导出他人书籍时也可选择使用作者共享的样式。</p>
            </div>
            {!loaded ? (
              <Loading className="py-16" label="正在加载导出设置…" />
            ) : (
              <div className="space-y-5 p-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="页面尺寸">
                    <Select value={s.page_size} onChange={(v) => setS({ ...s, page_size: v })}
                      options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'Letter' }]} />
                  </Field>
                  <Field label="页边距">
                    <Select value={s.margin} onChange={(v) => setS({ ...s, margin: v })}
                      options={[{ value: 'narrow', label: '窄' }, { value: 'normal', label: '常规' }, { value: 'wide', label: '宽' }]} />
                  </Field>
                  <Field label="正文字号" hint="12–20 px">
                    <Select value={String(s.font_size)} onChange={(v) => setS({ ...s, font_size: Number(v) })}
                      options={[12, 13, 14, 15, 16, 17, 18, 20].map((n) => ({ value: String(n), label: `${n} px` }))} />
                  </Field>
                  <Field label="代码配色">
                    <Select value={s.code_theme} onChange={(v) => setS({ ...s, code_theme: v })}
                      options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <div><div className="text-sm font-medium text-slate-900">包含封面页</div><p className="mt-1 text-xs text-slate-500">在 PDF 首页展示书籍封面与标题。</p></div>
                  <Switch checked={s.include_cover} onChange={(v) => setS({ ...s, include_cover: v })} ariaLabel="包含封面页" />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <div><div className="text-sm font-medium text-slate-900">包含目录</div><p className="mt-1 text-xs text-slate-500">在正文前插入章节目录。</p></div>
                  <Switch checked={s.include_toc} onChange={(v) => setS({ ...s, include_toc: v })} ariaLabel="包含目录" />
                </div>
                <Field label="每页页脚（Powered by）" hint={`留空使用默认「Powered by ${siteName}」；书籍单独配置时以书籍为准`}>
                  <Input value={s.footer} maxLength={100} placeholder={`Powered by ${siteName}`}
                    onChange={(e) => setS({ ...s, footer: e.target.value })} />
                </Field>
              </div>
            )}
            <div className="flex justify-end border-t border-slate-100 px-6 py-4">
              <Button loading={saving} onClick={save}>保存导出设置</Button>
            </div>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
