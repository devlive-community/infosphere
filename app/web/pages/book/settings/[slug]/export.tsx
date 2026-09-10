import { useEffect, useState } from 'react'
import type { InferGetServerSidePropsType } from 'next'
import { api } from '@/lib/api'
import { Button, Switch, Checkbox, Field, Select, Loading, useFeedback } from '@/components/ui'
import BookSettingsLayout from '@/components/BookSettingsLayout'
import { getBookSettingsProps } from '@/lib/book-settings'

export const getServerSideProps = getBookSettingsProps

interface BookStyle {
  page_size: string
  include_cover: boolean
  include_toc: boolean
  font_size: number
  code_theme: string
  margin: string
}
const DEFAULT_STYLE: BookStyle = { page_size: 'A4', include_cover: true, include_toc: true, font_size: 15, code_theme: 'light', margin: 'normal' }

// 书籍设置 · 导出设置：控制他人能否导出本书、是否共享作者导出样式（仅可管理者）
const ALL_FORMATS: { key: string; label: string; hint: string }[] = [
  { key: 'pdf', label: 'PDF', hint: '按导出样式渲染，需管理员已安装 PDF 导出插件' },
  { key: 'markdown', label: 'Markdown (zip)', hint: '章节 markdown 与图片打包，可再次导入' },
]

export default function BookSettingsExport({ book }: InferGetServerSidePropsType<typeof getBookSettingsProps>) {
  const { showToast } = useFeedback()
  const [exportEnabled, setExportEnabled] = useState(book.export_enabled ?? true)
  const [guestExportEnabled, setGuestExportEnabled] = useState(book.guest_export_enabled ?? true)
  const [styleShared, setStyleShared] = useState(book.export_style_shared ?? false)
  // 空字符串表示“全部格式可用”；否则为逗号分隔的允许格式
  const initialFormats = (book.export_formats || '').split(',').map((s) => s.trim()).filter(Boolean)
  const [formats, setFormats] = useState<string[]>(initialFormats.length ? initialFormats : ALL_FORMATS.map((f) => f.key))
  const [style, setStyle] = useState<BookStyle>(DEFAULT_STYLE)
  const [styleLoaded, setStyleLoaded] = useState(false)
  const [pdfAvailable, setPdfAvailable] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<BookStyle>(`/books/${book.id}/export-style`).then((d) => setStyle({ ...DEFAULT_STYLE, ...d })).catch(() => {}).finally(() => setStyleLoaded(true))
    api<{ available: boolean }>('/export/pdf-available').then((r) => setPdfAvailable(r.available)).catch(() => {})
  }, [book.id])

  function toggleFormat(key: string) {
    setFormats((cur) => cur.includes(key) ? cur.filter((f) => f !== key) : [...cur, key])
  }

  async function save() {
    // 插件未安装时不允许开启 PDF 格式
    const effective = pdfAvailable ? formats : formats.filter((f) => f !== 'pdf')
    if (effective.length === 0) { showToast({ title: '无法保存', message: '至少保留一种可用的导出格式', tone: 'error' }); return }
    setSaving(true)
    try {
      // 全选归一化为空串（表示全部），由后端统一处理
      const export_formats = effective.length === ALL_FORMATS.length ? '' : effective.join(',')
      await api(`/books/${book.id}`, { method: 'PUT', body: { export_enabled: exportEnabled, guest_export_enabled: guestExportEnabled, export_style_shared: styleShared, export_formats } })
      await api(`/books/${book.id}/export-style`, { method: 'PUT', body: style })
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
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900">允许他人导出本书</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">公开书籍开启后，读者可导出为 PDF（需管理员已安装 PDF 导出插件）；关闭仅作者/协作者可导出。</p>
              </div>
              <Switch checked={exportEnabled} onChange={setExportEnabled} ariaLabel="允许他人导出本书" />
            </div>
            <div className={`mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 ${exportEnabled ? '' : 'opacity-50'}`}>
              <div>
                <div className="text-sm font-medium text-slate-900">允许游客（未登录）导出</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">关闭后仅登录用户可导出本书；游客需登录后才能导出。需先开启上方「允许他人导出」。</p>
              </div>
              <Switch checked={exportEnabled && guestExportEnabled} disabled={!exportEnabled} onChange={setGuestExportEnabled} ariaLabel="允许游客导出" />
            </div>
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
              {ALL_FORMATS.map((f) => {
                const disabled = f.key === 'pdf' && !pdfAvailable
                return (
                  <label key={f.key} className={`flex items-start gap-3 rounded-lg border border-slate-200 p-3 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary-300'}`}>
                    <Checkbox checked={formats.includes(f.key) && !disabled} disabled={disabled} onChange={() => toggleFormat(f.key)} ariaLabel={f.label} />
                    <span>
                      <span className="text-sm font-medium text-slate-800">{f.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{disabled ? '需管理员先在后台「插件」中安装 PDF 导出插件' : f.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-900">书籍导出样式</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">当你共享导出样式时，读者选择「作者样式」将使用这里的设置（未配置则回退到你的个人导出设置）。</p>
            {!styleLoaded ? (
              <Loading className="py-8" label="正在加载书籍样式…" />
            ) : (
              <div className="mt-3 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="页面尺寸">
                    <Select value={style.page_size} onChange={(v) => setStyle({ ...style, page_size: v })}
                      options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'Letter' }]} />
                  </Field>
                  <Field label="页边距">
                    <Select value={style.margin} onChange={(v) => setStyle({ ...style, margin: v })}
                      options={[{ value: 'narrow', label: '窄' }, { value: 'normal', label: '常规' }, { value: 'wide', label: '宽' }]} />
                  </Field>
                  <Field label="正文字号" hint="12–20 px">
                    <Select value={String(style.font_size)} onChange={(v) => setStyle({ ...style, font_size: Number(v) })}
                      options={[12, 13, 14, 15, 16, 17, 18, 20].map((n) => ({ value: String(n), label: `${n} px` }))} />
                  </Field>
                  <Field label="代码配色">
                    <Select value={style.code_theme} onChange={(v) => setStyle({ ...style, code_theme: v })}
                      options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox checked={style.include_cover} onChange={(v) => setStyle({ ...style, include_cover: v })} ariaLabel="包含封面页" /> 包含封面页
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox checked={style.include_toc} onChange={(v) => setStyle({ ...style, include_toc: v })} ariaLabel="包含目录" /> 包含目录
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <Button loading={saving} onClick={save}>保存导出设置</Button>
        </div>
      </div>
    </BookSettingsLayout>
  )
}
