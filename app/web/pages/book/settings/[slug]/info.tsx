import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Button, EmptyState, Input, Select, useFeedback } from '@/components/ui'
import { BOOK_INFO_TYPES, bookInfoType } from '@/lib/book-info'
import type { Book, BookInfoItem } from '@/lib/types'

export const getServerSideProps = getBookSettingsProps

const MAX_ITEMS = 20

interface Row extends BookInfoItem { key: string }
let seq = 0
const toRow = (item: BookInfoItem): Row => ({ ...item, key: `r${++seq}` })

// 书籍设置 · 更多信息：GitHub、原始文档地址、许可证等附加属性，按顺序展示在书籍详情页。
export default function BookInfoSettings({ book }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [rows, setRows] = useState<Row[]>(((book as Book).extra_info || []).map(toRow))
  const [saving, setSaving] = useState(false)

  const update = (key: string, patch: Partial<BookInfoItem>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  function move(index: number, delta: number) {
    setRows((rs) => {
      const next = [...rs]
      const [item] = next.splice(index, 1)
      next.splice(index + delta, 0, item)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await api<Book>(`/books/${book.id}`, { method: 'PUT', body: { extra_info: rows.map(({ type, label, value }) => ({ type, label: label || '', value })) } })
      setRows((saved.extra_info || []).map(toRow))
      showToast({ message: t('bookInfo.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('bookInfo.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const typeOptions = BOOK_INFO_TYPES.map((d) => ({ value: d.type, label: t(`bookInfo.type.${d.type}`) }))
  return (
    <BookSettingsLayout book={book} active="info">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('bookInfo.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('bookInfo.subtitle')}</p>
      </div>
      <div className="max-w-3xl space-y-3">
        {rows.length === 0 ? <EmptyState>{t('bookInfo.empty')}</EmptyState> : rows.map((r, i) => {
          const def = bookInfoType(r.type)
          return (
            <div key={r.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[9rem_10rem_1fr_auto] sm:items-center">
              <Select value={r.type} onChange={(type) => update(r.key, { type })} options={typeOptions}
                leading={<i className={`${def.icon} text-slate-400`} aria-hidden="true" />} />
              <Input value={r.label || ''} maxLength={40} aria-label={t('bookInfo.label')}
                placeholder={r.type === 'custom' ? t('bookInfo.labelRequired') : t(`bookInfo.type.${def.type}`)}
                onChange={(e) => update(r.key, { label: e.target.value })} />
              <Input value={r.value} maxLength={500} aria-label={t('bookInfo.value')} placeholder={t(`bookInfo.placeholder.${def.kind}`)}
                onChange={(e) => update(r.key, { value: e.target.value })} />
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" aria-label={t('bookInfo.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}><i className="fa-solid fa-arrow-up" aria-hidden="true" /></Button>
                <Button variant="ghost" size="sm" aria-label={t('bookInfo.moveDown')} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><i className="fa-solid fa-arrow-down" aria-hidden="true" /></Button>
                <Button variant="ghost" size="sm" className="text-rose-600" aria-label={t('common.actions.delete')} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><i className="fa-solid fa-xmark" aria-hidden="true" /></Button>
              </span>
            </div>
          )
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button variant="outline" disabled={rows.length >= MAX_ITEMS} onClick={() => setRows((rs) => [...rs, toRow({ type: rs.length === 0 ? 'github' : 'website', value: '' })])}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> {t('bookInfo.add')}
          </Button>
          <Button loading={saving} onClick={save}>{t('common.actions.save')}</Button>
        </div>
        <p className="text-xs text-slate-400">{t('bookInfo.hint', { max: MAX_ITEMS })}</p>
      </div>
    </BookSettingsLayout>
  )
}
