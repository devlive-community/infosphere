import { ReactNode, useEffect, useRef, useState } from 'react'
import { API_BASE, getToken } from '@/lib/api'
import { isQueuedTask, waitForTask, type QueuedTask } from '@/lib/background-tasks'
import { Button, Card, Select } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

type ImportMode = 'append' | 'replace'

interface ReimportResult {
  mode: ImportMode
  imported_doc: number
  removed_doc: number
  pages: number
  message: string
}

interface PDFReimportPanelProps {
  bookId: number
  onImported: () => Promise<unknown>
  embedded?: boolean
  onBusyChange?: (busy: boolean) => void
}

export default function PDFReimportPanel({ bookId, onImported, embedded = false, onBusyChange }: PDFReimportPanelProps) {
  const { t } = useTranslation()
  const modeOptions = [
    { value: 'append', label: t('pdfReimport.modeAppend') },
    { value: 'replace', label: t('pdfReimport.modeReplace') },
  ]
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
      setError(t('pdfReimport.selectFile'))
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
        throw new Error(payload.message || t('pdfReimport.failed', { status: response.status }))
      }
      const responseData = payload.data as ReimportResult | QueuedTask<ReimportResult>
      const imported = isQueuedTask(responseData) ? await waitForTask<ReimportResult>(responseData.task.id) : responseData
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
            <h2 className="font-semibold text-slate-900">{t('pdfReimport.heading')}</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t('pdfReimport.desc')}
          </p>
        </div>}

        <div className={`w-full space-y-3 ${embedded ? '' : 'lg:max-w-md'}`}>
          <Select value={mode} onChange={changeMode} options={modeOptions} disabled={submitting} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={submitting} onClick={() => inputRef.current?.click()} className="min-w-0 flex-1">
              <i className="fa-solid fa-upload" aria-hidden="true" />
              <span className="max-w-[240px] truncate">{file?.name || t('pdfReimport.choosePdf')}</span>
            </Button>
            <Button type="button" variant={mode === 'replace' ? 'danger' : 'primary'} loading={submitting} onClick={() => submit()}>
              {mode === 'replace' ? t('pdfReimport.doReplace') : t('pdfReimport.doAppend')}
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
              ? t('pdfReimport.replaceWarn')
              : t('pdfReimport.appendWarn')}
          </p>
        </div>
      </div>

      {confirming && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-5 text-rose-700">{t('pdfReimport.confirmReplace')}</p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t('common.actions.cancel')}</Button>
            <Button type="button" size="sm" variant="danger" onClick={() => submit(true)}>{t('pdfReimport.confirmReplaceBtn')}</Button>
          </div>
        </div>
      )}
      {submitting && <p className="mt-4 text-sm text-primary-600" aria-live="polite">{t('pdfReimport.uploading')}</p>}
      {error && <div className="mt-4 max-h-28 overflow-y-auto break-words rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600" role="alert">{error}</div>}
      {result && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{result.message}</div>}
    </>
  )

  if (embedded) return <div className="px-5 py-5 sm:px-6 sm:py-6">{content}</div>
  return <Card className="p-5 sm:p-6">{content}</Card>
}
