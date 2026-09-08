import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { InferGetServerSidePropsType } from 'next'
import { api } from '@/lib/api'
import { Badge, Button, ButtonLink, Loading, EmptyState, useFeedback } from '@/components/ui'
import { FileTextIcon, PencilIcon, TrashIcon } from '@/components/icons'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import type { Document } from '@/lib/types'

export const getServerSideProps = getBookSettingsProps

function flatten(docs: Document[], level = 0): { doc: Document; level: number }[] {
  return docs.flatMap((d) => [{ doc: d, level }, ...flatten(d.children || [], level + 1)])
}

const STATUS: Record<string, { label: string; tone: 'emerald' | 'slate' | 'amber' }> = {
  published: { label: '已发布', tone: 'emerald' },
  draft: { label: '草稿', tone: 'amber' },
  archived: { label: '已归档', tone: 'slate' },
}

// 书籍设置 · 章节管理：查看全部章节，快速跳转编辑或删除（仅可管理者）
export default function BookSettingsChapters({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast, confirmAction } = useFeedback()
  const [docs, setDocs] = useState<Document[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(() => {
    api<Document[]>(`/books/${book.id}/documents`).then((d) => setDocs(d || [])).catch((e) => showToast({ title: '加载失败', message: (e as Error).message, tone: 'error' }))
  }, [book.id, showToast])
  useEffect(() => { load() }, [load])

  async function remove(doc: Document) {
    if (!(await confirmAction({ title: '删除章节', message: `确定删除章节「${doc.title}」及其子章节吗？此操作不可恢复。`, confirmLabel: '删除章节', danger: true }))) return
    setBusy(doc.id)
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      showToast({ title: '删除失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const rows = docs ? flatten(docs) : []

  return (
    <BookSettingsLayout book={book} active="chapters">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">章节管理</h2>
            <p className="mt-1 text-sm text-slate-500">查看本书全部章节，跳转编辑或删除；排序与内容编辑请在写作台完成。</p>
          </div>
          <ButtonLink href={`/book/writer/${encodeURIComponent(book.slug)}`}>进入写作台</ButtonLink>
        </div>

        {docs === null ? (
          <Loading className="py-16" label="正在加载章节…" />
        ) : rows.length === 0 ? (
          <div className="p-6"><EmptyState>还没有章节，<Link href={`/book/writer/${encodeURIComponent(book.slug)}`} className="text-primary-600 hover:underline">去写作台创建</Link></EmptyState></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ doc, level }) => {
              const meta = STATUS[doc.status] || STATUS.draft
              return (
                <li key={doc.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50/60">
                  <span className="shrink-0" style={{ marginLeft: level * 16 }}><FileTextIcon className="h-4 w-4 text-slate-300" /></span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{book.chapter_prefix}{doc.title}</span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <Link href={`/book/writer/${encodeURIComponent(book.slug)}/${encodeURIComponent(doc.slug)}`}
                    className="flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs text-slate-600 transition-colors hover:border-primary-400 hover:text-primary-600">
                    <PencilIcon className="h-3.5 w-3.5" /> 编辑
                  </Link>
                  <Button size="sm" variant="danger" disabled={busy === doc.id} onClick={() => remove(doc)}>
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </BookSettingsLayout>
  )
}
