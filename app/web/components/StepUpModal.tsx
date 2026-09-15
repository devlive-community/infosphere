import { useEffect, useRef, useState } from 'react'
import { api, setStepUpHandler } from '@/lib/api'
import { Modal, Button, Input } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

// StepUpModal 全局二次认证弹窗：任意接口返回 TWO_FACTOR_REQUIRED 时弹出，
// 用户输入动态码/备用码验证通过后，原请求由 api() 自动重试。
export default function StepUpModal() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  useEffect(() => {
    setStepUpHandler(() => new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setCode('')
      setError('')
      setOpen(true)
    }))
    return () => setStepUpHandler(null)
  }, [])

  function finish(verified: boolean) {
    setOpen(false)
    resolverRef.current?.(verified)
    resolverRef.current = null
  }

  async function verify() {
    setLoading(true)
    setError('')
    try {
      await api('/auth/2fa/verify', { method: 'POST', body: { code: code.trim() } })
      finish(true)
    } catch (e) {
      setError((e as Error).message || t('stepup.verifyFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      elevated
      onClose={() => finish(false)}
      title={t('auth.twofactor.title')}
      footer={<>
        <Button variant="ghost" onClick={() => finish(false)}>{t('common.actions.cancel')}</Button>
        <Button loading={loading} disabled={!code.trim()} onClick={verify}>{t('stepup.verify')}</Button>
      </>}
    >
      <p className="text-sm leading-6 text-slate-500">{t('stepup.desc')}</p>
      <div className="mt-4">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('stepup.placeholder')}
          autoComplete="one-time-code" autoFocus aria-label={t('stepup.ariaCode')}
          onKeyDown={(e) => { if (e.key === 'Enter') void verify() }} />
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </Modal>
  )
}
