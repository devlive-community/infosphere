import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { api } from '@/lib/api'
import { Button, Switch, useFeedback } from '@/components/ui'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 导出设置：控制他人能否导出本书、是否共享作者导出样式（仅可管理者）
export default function BookSettingsExport({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast } = useFeedback()
  const [exportEnabled, setExportEnabled] = useState(book.export_enabled ?? true)
  const [styleShared, setStyleShared] = useState(book.export_style_shared ?? false)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api(`/books/${book.id}`, { method: 'PUT', body: { export_enabled: exportEnabled, export_style_shared: styleShared } })
      showToast({ title: '已保存', message: '导出设置已更新', tone: 'success' })
    } catch (e) {
      showToast({ title: '保存失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <BookSettingsLayout book={book} active="export">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-900">导出设置</h2>
          <p className="mt-1 text-sm text-slate-500">控制读者能否导出本书，以及是否向他们共享你的导出样式。水印始终按书籍设置生效。</p>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <div>
              <div className="text-sm font-medium text-slate-900">允许他人导出本书</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">公开书籍开启后，读者可导出为 PDF（需管理员已安装 PDF 导出插件）；关闭仅作者/协作者可导出。</p>
            </div>
            <Switch checked={exportEnabled} onChange={setExportEnabled} ariaLabel="允许他人导出本书" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <div>
              <div className="text-sm font-medium text-slate-900">共享我的导出样式</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">开启后，他人导出本书时可选择使用你的导出样式；否则只能用他们自己的样式。</p>
            </div>
            <Switch checked={styleShared} onChange={setStyleShared} ariaLabel="共享我的导出样式" />
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <Button loading={saving} onClick={save}>保存导出设置</Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
