import { useState } from 'react'
import { useRouter } from 'next/router'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Field, Modal, Select, Textarea, useFeedback } from '@/components/ui'

export type ReportTargetType = 'book' | 'document' | 'comment'

const reasonOptions = [
  { value: 'spam', label: '垃圾信息或广告' },
  { value: 'harassment', label: '骚扰或人身攻击' },
  { value: 'copyright', label: '侵犯版权' },
  { value: 'illegal', label: '违法违规内容' },
  { value: 'misleading', label: '虚假或误导信息' },
  { value: 'other', label: '其他问题' },
]

interface ReportButtonProps {
  targetType: ReportTargetType
  targetId: number
  className?: string
  compact?: boolean
}

// ReportButton 公开内容统一举报入口；表单与反馈均使用站内组件。
export default function ReportButton({ targetType, targetId, className, compact = false }: ReportButtonProps) {
  const { user, authReady } = useApp()
  const { showToast } = useFeedback()
  const router = useRouter()
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
      setError('请选择举报原因')
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
      showToast({ title: '举报已提交', message: '管理员处理后会通过站内通知告知结果。', tone: 'success' })
    } catch (requestError) {
      setError((requestError as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={beginReport} disabled={!authReady}
        className={`text-slate-400 hover:text-rose-600 ${className || ''}`.trim()}>
        <i className="fa-regular fa-flag" aria-hidden="true" />
        {compact ? <span className="sr-only">举报</span> : '举报'}
      </Button>

      <Modal open={open} onClose={close} title="举报内容"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={submitting}>取消</Button>
            <Button type="button" onClick={submit} loading={submitting}>提交举报</Button>
          </>
        )}>
        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-500">请选择最符合的原因。我们只会将举报信息提供给管理员，内容作者不会看到你的身份。</p>
          <Field label="举报原因">
            <Select value={reason} onChange={setReason} options={reasonOptions} placeholder="请选择举报原因" disabled={submitting} />
          </Field>
          <Field label="补充说明" hint={`${description.length}/1000，可选`}>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000}
              rows={5} disabled={submitting} placeholder="请说明具体问题，帮助管理员更快判断" />
          </Field>
          {error && <p role="alert" className="max-h-24 overflow-y-auto break-words rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>
      </Modal>
    </>
  )
}
