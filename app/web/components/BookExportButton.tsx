import { useEffect, useRef, useState } from 'react'
import { api, API_BASE, getToken } from '@/lib/api'
import { useFeedback } from '@/components/ui'
import { DownloadIcon, ChevronDownIcon } from '@/components/icons'
import type { Book } from '@/lib/types'

interface ExportOptions {
  can_export: boolean
  formats: string[]
  style_shared: boolean
  pdf_available: boolean
}

const FORMAT_LABEL: Record<string, string> = { pdf: 'PDF', markdown: 'Markdown (zip)' }

// BookExportButton 书籍详情页导出入口：按后端返回的可用格式与样式选项渲染下拉菜单。
// 仅在当前用户对该书具备导出能力时显示（作者/协作者，或公开且作者开启导出）。
export default function BookExportButton({ book }: { book: Book }) {
  const { showToast } = useFeedback()
  const [opts, setOpts] = useState<ExportOptions | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<ExportOptions>(`/books/${book.id}/export/options`).then(setOpts).catch(() => setOpts(null))
  }, [book.id])

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!opts?.can_export || opts.formats.length === 0) return null

  async function download(format: string, style: 'author' | 'mine') {
    const key = `${format}:${style}`
    setBusy(key)
    setOpen(false)
    try {
      const path = format === 'pdf'
        ? `/books/${book.id}/export/pdf?style=${style}`
        : `/books/${book.id}/export/markdown`
      const token = getToken()
      const res = await fetch(`${API_BASE}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      if (!res.ok) {
        const msg = await res.json().then((p) => p.message).catch(() => '')
        throw new Error(msg || '导出失败，请稍后重试')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${book.slug}.${format === 'pdf' ? 'pdf' : 'zip'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast({ title: '导出失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy('')
    }
  }

  const busyAny = busy !== ''

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={busyAny}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 disabled:opacity-60">
        <DownloadIcon className="h-4 w-4" /> {busyAny ? '导出中…' : '导出'} <ChevronDownIcon className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {opts.formats.map((fmt) => {
            if (fmt === 'pdf') {
              // PDF 需插件；作者共享样式时提供两种样式选择
              const disabled = !opts.pdf_available
              const styles: ('author' | 'mine')[] = opts.style_shared ? ['author', 'mine'] : ['mine']
              return (
                <div key="pdf">
                  <div className="px-4 pb-1 pt-2 text-xs font-medium text-slate-400">PDF{disabled ? '（插件未安装）' : ''}</div>
                  {styles.map((st) => (
                    <button key={st} type="button" disabled={disabled} onClick={() => download('pdf', st)}
                      className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
                      {opts.style_shared ? (st === 'author' ? '使用作者样式' : '使用我的样式') : '导出 PDF'}
                    </button>
                  ))}
                </div>
              )
            }
            return (
              <button key={fmt} type="button" onClick={() => download(fmt, 'mine')}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                {FORMAT_LABEL[fmt] || fmt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
