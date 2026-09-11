import { useEffect, useRef, useState } from 'react'
import { api, setStepUpHandler } from '@/lib/api'
import { Modal, Button, Input } from '@/components/ui'

// StepUpModal 全局二次认证弹窗：任意接口返回 TWO_FACTOR_REQUIRED 时弹出，
// 用户输入动态码/备用码验证通过后，原请求由 api() 自动重试。
export default function StepUpModal() {
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
      setError((e as Error).message || '验证失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => finish(false)}
      title="二次认证"
      footer={<>
        <Button variant="ghost" onClick={() => finish(false)}>取消</Button>
        <Button loading={loading} disabled={!code.trim()} onClick={verify}>验证</Button>
      </>}
    >
      <p className="text-sm leading-6 text-slate-500">该操作需要二次认证。请输入身份验证器 App 中的 6 位动态码，或一条备用码。</p>
      <div className="mt-4">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位动态码 / 备用码"
          autoComplete="one-time-code" autoFocus aria-label="二次认证码"
          onKeyDown={(e) => { if (e.key === 'Enter') void verify() }} />
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </Modal>
  )
}
