import { ReactNode, useEffect, useRef, useState } from 'react'
import { API_BASE, getToken } from '@/lib/api'
import { Button, Card, Select } from '@/components/ui'

type ImportMode = 'append' | 'replace'

interface ReimportResult {
  mode: ImportMode
  imported_doc: number
  removed_doc: number
  pages: number
  message: string
}

const modeOptions = [
  { value: 'append', label: '追加到现有章节之后' },
  { value: 'replace', label: '覆盖全部现有章节' },
]

interface PDFReimportPanelProps {
  bookId: number
  onImported: () => Promise<unknown>
  embedded?: boolean
  onBusyChange?: (busy: boolean) => void
}

export default function PDFReimportPanel({ bookId, onImported, embedded = false, onBusyChange }: PDFReimportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<ImportMode>('append')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReimportResult | null>(null)

  useEffect(() => { onBusyChange?.(submitting) }, [submitting, onBusyChange])

  function changeMode(value: string) {
    setMode(value as ImportMode)
    setConfirming(false)
    setError('')
    setResult(null)
  }

  async function submit(confirmed = false) {
    if (!file) {
      setError('请选择要重新导入的 PDF 文件')
      return
    }
    if (mode === 'replace' && !confirmed) {
      setConfirming(true)
      return
    }
    setSubmitting(true)
    setConfirming(false)
    setError('')
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', mode)
      const token = getToken()
      const response = await fetch(`${API_BASE}/api/v1/books/${bookId}/import/pdf`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `重新导入失败 (${response.status})`)
      }
      const imported = payload.data as ReimportResult
      setResult(imported)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await onImported()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const content: ReactNode = (
    <>
      <div className={`flex flex-col gap-5 ${embedded ? '' : 'lg:flex-row lg:items-start lg:justify-between'}`}>
        {!embedded && <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <i className="fa-solid fa-file-pdf text-sm" aria-hidden="true" />
            </span>
            <h2 className="font-semibold text-slate-900">重新导入 PDF</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            重新解析 PDF 并重建 Markdown 章节。追加不会影响现有内容；覆盖适合修正错误导入。
          </p>
        </div>}

        <div className={`w-full space-y-3 ${embedded ? '' : 'lg:max-w-md'}`}>
          <Select value={mode} onChange={changeMode} options={modeOptions} disabled={submitting} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={submitting} onClick={() => inputRef.current?.click()} className="min-w-0 flex-1">
              <i className="fa-solid fa-upload" aria-hidden="true" />
              <span className="max-w-[240px] truncate">{file?.name || '选择 PDF 文件'}</span>
            </Button>
            <Button type="button" variant={mode === 'replace' ? 'danger' : 'primary'} loading={submitting} onClick={() => submit()}>
              {mode === 'replace' ? '覆盖导入' : '追加导入'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              hidden
              onChange={(event) => {
                setFile(event.target.files?.[0] || null)
                setConfirming(false)
                setError('')
                setResult(null)
              }}
            />
          </div>
          <p className={`text-xs leading-5 ${mode === 'replace' ? 'text-rose-600' : 'text-slate-400'}`}>
            {mode === 'replace'
              ? '覆盖会删除旧章节及其评论、版本和阅读进度，并将书籍转为私有草稿。'
              : '新章节会以草稿状态追加到目录末尾，现有章节和发布状态保持不变。'}
          </p>
        </div>
      </div>

      {confirming && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-5 text-rose-700">确定覆盖全部现有章节吗？该操作完成后无法从章节历史恢复旧内容。</p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>取消</Button>
            <Button type="button" size="sm" variant="danger" onClick={() => submit(true)}>确认覆盖</Button>
          </div>
        </div>
      )}
      {submitting && <p className="mt-4 text-sm text-primary-600" aria-live="polite">正在解析 PDF 并重建 Markdown 章节，请勿关闭页面…</p>}
      {error && <div className="mt-4 max-h-28 overflow-y-auto break-words rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600" role="alert">{error}</div>}
      {result && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{result.message}</div>}
    </>
  )

  if (embedded) return <div className="px-5 py-5 sm:px-6 sm:py-6">{content}</div>
  return <Card className="p-5 sm:p-6">{content}</Card>
}
