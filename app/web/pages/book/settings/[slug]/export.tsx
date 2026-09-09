import { useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { api } from '@/lib/api'
import { Button, Switch, useFeedback } from '@/components/ui'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'

export const getServerSideProps = getBookSettingsProps

// 书籍设置 · 导出设置：控制他人能否导出本书、是否共享作者导出样式（仅可管理者）
const ALL_FORMATS: { key: string; label: string; hint: string }[] = [
  { key: 'pdf', label: 'PDF', hint: '按导出样式渲染，需管理员已安装 PDF 导出插件' },
  { key: 'markdown', label: 'Markdown (zip)', hint: '章节 markdown 与图片打包，可再次导入' },
]

export default function BookSettingsExport({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast } = useFeedback()
  const [exportEnabled, setExportEnabled] = useState(book.export_enabled ?? true)
  const [styleShared, setStyleShared] = useState(book.export_style_shared ?? false)
  // 空字符串表示“全部格式可用”；否则为逗号分隔的允许格式
  const initialFormats = (book.export_formats || '').split(',').map((s) => s.trim()).filter(Boolean)
  const [formats, setFormats] = useState<string[]>(initialFormats.length ? initialFormats : ALL_FORMATS.map((f) => f.key))
  const [saving, setSaving] = useState(false)

  function toggleFormat(key: string) {
    setFormats((cur) => cur.includes(key) ? cur.filter((f) => f !== key) : [...cur, key])
  }

  async function save() {
    if (formats.length === 0) { showToast({ title: '无法保存', message: '至少保留一种导出格式', tone: 'error' }); return }
    setSaving(true)
    try {
      // 全选归一化为空串（表示全部），由后端统一处理
      const export_formats = formats.length === ALL_FORMATS.length ? '' : formats.join(',')
      await api(`/books/${book.id}`, { method: 'PUT', body: { export_enabled: exportEnabled, export_style_shared: styleShared, export_formats } })
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

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-900">允许导出的格式</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">读者只能选择你允许的格式；全部选中表示不限制。</p>
            <div className="mt-3 space-y-2">
              {ALL_FORMATS.map((f) => (
                <label key={f.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-primary-300">
                  <input type="checkbox" checked={formats.includes(f.key)} onChange={() => toggleFormat(f.key)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <span>
                    <span className="text-sm font-medium text-slate-800">{f.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{f.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <Button loading={saving} onClick={save}>保存导出设置</Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
