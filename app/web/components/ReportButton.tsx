import { useState } from 'react'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Field, Modal, Select, Textarea, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

export type ReportTargetType = 'book' | 'document' | 'comment'

const REASON_KEYS: { value: string; key: string }[] = [
  { value: 'spam', key: 'report.reasonSpam' },
  { value: 'harassment', key: 'report.reasonHarassment' },
  { value: 'copyright', key: 'report.reasonCopyright' },
  { value: 'illegal', key: 'report.reasonIllegal' },
  { value: 'misleading', key: 'report.reasonMisleading' },
  { value: 'other', key: 'report.reasonOther' },
]

interface ReportButtonProps {
  targetType: ReportTargetType
  targetId: number
  className?: string
  compact?: boolean
  size?: 'sm' | 'md' | 'lg'
}

// ReportButton 公开内容统一举报入口；表单与反馈均使用站内组件。
export default function ReportButton({ targetType, targetId, className, compact = false, size = 'sm' }: ReportButtonProps) {
  const { t } = useTranslation()
  const { user, authReady } = useApp()
  const { showToast } = useFeedback()
  const router = useRouter()
  const reasonOptions = REASON_KEYS.map((r) => ({ value: r.value, label: t(r.key) }))
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function beginReport() {
    if (!authReady) return
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
      return
    }
    setError('')
    setOpen(true)
  }

  function close() {
    if (submitting) return
    setOpen(false)
    setError('')
  }

  async function submit() {
    if (!reason) {
      setError(t('report.selectReason'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await api('/reports', {
        method: 'POST',
        body: { target_type: targetType, target_id: targetId, reason, description: description.trim() },
      })
      setOpen(false)
      setReason('')
      setDescription('')
      showToast({ title: t('report.submitted'), message: t('report.submittedMsg'), tone: 'success' })
    } catch (requestError) {
      setError((requestError as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size={size} onClick={beginReport} disabled={!authReady}
        className={`text-slate-400 hover:text-rose-600 ${className || ''}`.trim()}>
        <i className="fa-regular fa-flag" aria-hidden="true" />
        {compact ? <span className="sr-only">{t('report.button')}</span> : t('report.button')}
      </Button>

      <Modal open={open} onClose={close} title={t('report.title')}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={submitting}>{t('common.actions.cancel')}</Button>
            <Button type="button" onClick={submit} loading={submitting}>{t('report.submit')}</Button>
          </>
        )}>
        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-500">{t('report.desc')}</p>
          <Field label={t('report.reasonLabel')}>
            <Select value={reason} onChange={setReason} options={reasonOptions} placeholder={t('report.selectReason')} disabled={submitting} />
          </Field>
          <Field label={t('report.descLabel')} hint={t('report.descHint', { n: description.length })}>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000}
              rows={5} disabled={submitting} placeholder={t('report.descPlaceholder')} />
          </Field>
          {error && <p role="alert" className="max-h-24 overflow-y-auto break-words rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>
      </Modal>
    </>
  )
}
