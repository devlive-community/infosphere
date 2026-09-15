import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Input, Switch, Modal, Loading, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface TwoFactorState {
  enabled: boolean
  operations: string[]
}

const OP_KEYS = ['login', 'credentials', 'delete', 'unbind_export']

// TwoFactorSettings 账户设置 · 二次认证（TOTP）：开启/关闭、逐操作配置、备用码。
export default function TwoFactorSettings() {
  const { t } = useTranslation()
  const { refreshUser } = useApp()
  const { showToast } = useFeedback()
  const OP_LABELS = OP_KEYS.map((key) => ({ key, label: t(`tfa.op.${key}.label`), hint: t(`tfa.op.${key}.hint`) }))
  const [state, setState] = useState<TwoFactorState | null>(null)
  const [busy, setBusy] = useState(false)

  // 开启流程
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [setupError, setSetupError] = useState('')

  // 备用码展示（仅一次）
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  // 需要动态码确认的操作（关闭 / 重新生成备用码）
  const [codeAction, setCodeAction] = useState<'disable' | 'regenerate' | null>(null)
  const [actionCode, setActionCode] = useState('')
  const [actionError, setActionError] = useState('')

  const load = () => api<TwoFactorState>('/auth/2fa').then(setState).catch(() => setState({ enabled: false, operations: [] }))
  useEffect(() => { load() }, [])

  if (!state) return <Loading className="py-6" label={t('tfa.loading')} />

  const ops = new Set(state.operations)

  async function startSetup() {
    setBusy(true)
    setSetupError('')
    try {
      const d = await api<{ secret: string; qr: string }>('/auth/2fa/setup', { method: 'POST' })
      setSetup({ secret: d.secret, qr: d.qr })
      setSetupCode('')
    } catch (e) {
      showToast({ message: (e as Error).message || t('tfa.genFailed'), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnable() {
    setBusy(true)
    setSetupError('')
    try {
      const d = await api<{ backup_codes: string[] }>('/auth/2fa/enable', { method: 'POST', body: { code: setupCode.trim() } })
      setSetup(null)
      setBackupCodes(d.backup_codes)
      await load()
      refreshUser?.().catch(() => {})
      showToast({ message: t('tfa.enabledToast'), tone: 'success' })
    } catch (e) {
      setSetupError((e as Error).message || t('tfa.verifyFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleOp(key: string, on: boolean) {
    const next = new Set(ops)
    if (on) next.add(key); else next.delete(key)
    const arr = Array.from(next)
    setState({ ...state!, operations: arr }) // 乐观更新
    try {
      const d = await api<{ operations: string[] }>('/auth/2fa/operations', { method: 'PUT', body: { operations: arr } })
      setState((s) => (s ? { ...s, operations: d.operations } : s))
    } catch (e) {
      await load()
      showToast({ message: (e as Error).message || t('tfa.saveFailed'), tone: 'error' })
    }
  }

  async function runCodeAction() {
    setBusy(true)
    setActionError('')
    try {
      if (codeAction === 'disable') {
        await api('/auth/2fa/disable', { method: 'POST', body: { code: actionCode.trim() } })
        setCodeAction(null)
        await load()
        refreshUser?.().catch(() => {})
        showToast({ message: t('tfa.disabledToast'), tone: 'success' })
      } else if (codeAction === 'regenerate') {
        const d = await api<{ backup_codes: string[] }>('/auth/2fa/backup-codes', { method: 'POST', body: { code: actionCode.trim() } })
        setCodeAction(null)
        setBackupCodes(d.backup_codes)
      }
      setActionCode('')
    } catch (e) {
      setActionError((e as Error).message || t('tfa.verifyFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t('tfa.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('tfa.subtitle')}</p>
        </div>
        <span className={`rounded-lg px-3 py-1.5 text-sm font-medium ${state.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {state.enabled ? t('tfa.statusOn') : t('tfa.statusOff')}
        </span>
      </div>

      <div className="space-y-5 px-6 pb-6">
        {!state.enabled && !setup && (
          <Button loading={busy} onClick={startSetup}>{t('tfa.enable')}</Button>
        )}

        {/* 扫码 + 确认 */}
        {!state.enabled && setup && (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">{t('tfa.step1')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {setup.qr && <img src={setup.qr} alt={t('tfa.qrAlt')} className="h-40 w-40 rounded-lg border border-slate-200" />}
              <code className="rounded bg-slate-100 px-2 py-1 font-mono text-sm tracking-widest text-slate-700">{setup.secret}</code>
            </div>
            <p className="mt-4 text-sm text-slate-600">{t('tfa.step2')}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-40"><Input value={setupCode} onChange={(e) => setSetupCode(e.target.value)} placeholder={t('tfa.codePlaceholder')} autoComplete="one-time-code" aria-label={t('tfa.codeAria')} /></span>
              <Button loading={busy} disabled={!setupCode.trim()} onClick={confirmEnable}>{t('tfa.confirmEnable')}</Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>{t('common.actions.cancel')}</Button>
            </div>
            {setupError && <p className="mt-2 text-sm text-rose-600">{setupError}</p>}
          </div>
        )}

        {/* 已开启：操作配置 + 备用码 + 关闭 */}
        {state.enabled && (
          <>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">{t('tfa.opsHeading')}</h3>
              <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {OP_LABELS.map((op) => (
                  <div key={op.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">{op.label}</div>
                      <div className="text-xs text-slate-400">{op.hint}</div>
                    </div>
                    <Switch ariaLabel={op.label} checked={ops.has(op.key)} onChange={(v) => toggleOp(op.key, v)} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setCodeAction('regenerate'); setActionCode(''); setActionError('') }}>{t('tfa.regenBackup')}</Button>
              <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => { setCodeAction('disable'); setActionCode(''); setActionError('') }}>{t('tfa.disable')}</Button>
            </div>
          </>
        )}
      </div>

      {/* 备用码展示（仅一次） */}
      <Modal open={backupCodes !== null} onClose={() => setBackupCodes(null)} title={t('tfa.backupTitle')}
        footer={<Button onClick={() => setBackupCodes(null)}>{t('tfa.backupSaved')}</Button>}>
        <p className="text-sm leading-6 text-slate-500">{t('tfa.backupDesc')}<b className="text-slate-700">{t('tfa.backupDescBold')}</b></p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(backupCodes || []).map((code) => (
            <code key={code} className="rounded bg-slate-100 px-2 py-1.5 text-center font-mono text-sm tracking-widest text-slate-700">{code}</code>
          ))}
        </div>
      </Modal>

      {/* 关闭 / 重新生成：需要动态码确认 */}
      <Modal open={codeAction !== null} onClose={() => setCodeAction(null)}
        title={codeAction === 'disable' ? t('tfa.disable') : t('tfa.regenTitle')}
        footer={<>
          <Button variant="ghost" onClick={() => setCodeAction(null)}>{t('common.actions.cancel')}</Button>
          <Button loading={busy} disabled={!actionCode.trim()} onClick={runCodeAction}>{t('common.actions.confirm')}</Button>
        </>}>
        <p className="text-sm text-slate-500">{t('tfa.actionCodePrompt')}</p>
        <div className="mt-3">
          <Input value={actionCode} onChange={(e) => setActionCode(e.target.value)} placeholder={t('tfa.actionCodePlaceholder')} autoComplete="one-time-code" autoFocus aria-label={t('tfa.codeAria')}
            onKeyDown={(e) => { if (e.key === 'Enter') void runCodeAction() }} />
        </div>
        {actionError && <p className="mt-2 text-sm text-rose-600">{actionError}</p>}
      </Modal>
    </div>
  )
}
