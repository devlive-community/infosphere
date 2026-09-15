import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Select, Switch, Loading } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface CaptchaSettings {
  type: string
  length: number
  charset: string
  noise: number
  arith_hard: boolean
  on_register: boolean
  on_login: boolean
  on_comment: boolean
}

// 系统设置 · 验证码：内置图形/算术验证码，可配复杂度并在各场景分别开启（仅管理员）
export default function SettingsCaptcha() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const [cfg, setCfg] = useState<CaptchaSettings>({
    type: 'image', length: 4, charset: 'alnum', noise: 1, arith_hard: false,
    on_register: false, on_login: false, on_comment: false,
  })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<CaptchaSettings>('/captcha-settings')
      .then(setCfg)
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await api<CaptchaSettings>('/captcha-settings', { method: 'PUT', body: cfg })
      setCfg(saved)
      setMessage(t('admin.settings.captcha.saved'))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const scene = (label: string, key: 'on_register' | 'on_login' | 'on_comment', hint: string) => (
    <Field label={label} hint={hint}>
      <Switch ariaLabel={label} checked={cfg[key]} onChange={(v) => setCfg({ ...cfg, [key]: v })} />
    </Field>
  )

  return (
    <SettingsLayout active="captcha" description={t('admin.settings.captcha.description')}>
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.captcha.loading')} /> : (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">{t('admin.settings.captcha.typeAndComplexity')}</h3>
          <div className="space-y-5">
            <Field label={t('admin.settings.captcha.type')}>
              <Select
                options={[{ value: 'image', label: t('admin.settings.captcha.typeImage') }, { value: 'arithmetic', label: t('admin.settings.captcha.typeArithmetic') }]}
                value={cfg.type} onChange={(v) => setCfg({ ...cfg, type: v })} />
            </Field>

            {cfg.type === 'image' ? (
              <>
                <Field label={t('admin.settings.captcha.charCount')}>
                  <Select options={[4, 5, 6].map((n) => ({ value: String(n), label: `${n} ${t('admin.settings.captcha.chars')}` }))}
                    value={String(cfg.length)} onChange={(v) => setCfg({ ...cfg, length: Number(v) })} />
                </Field>
                <Field label={t('admin.settings.captcha.charset')}>
                  <Select options={[{ value: 'alnum', label: t('admin.settings.captcha.charsetAlnum') }, { value: 'digit', label: t('admin.settings.captcha.charsetDigit') }]}
                    value={cfg.charset} onChange={(v) => setCfg({ ...cfg, charset: v })} />
                </Field>
                <Field label={t('admin.settings.captcha.noise')} hint={t('admin.settings.captcha.noiseHint')}>
                  <Select options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: [t('admin.settings.captcha.noiseNone'), t('admin.settings.captcha.noiseLow'), t('admin.settings.captcha.noiseMedium'), t('admin.settings.captcha.noiseHigh')][n] }))}
                    value={String(cfg.noise)} onChange={(v) => setCfg({ ...cfg, noise: Number(v) })} />
                </Field>
              </>
            ) : (
              <Field label={t('admin.settings.captcha.hardArithmetic')} hint={t('admin.settings.captcha.hardArithmeticHint')}>
                <Switch ariaLabel={t('admin.settings.captcha.hardArithmetic')} checked={cfg.arith_hard} onChange={(v) => setCfg({ ...cfg, arith_hard: v })} />
              </Field>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">{t('admin.settings.captcha.enablePositions')}</h3>
          <div className="space-y-5">
            {scene(t('admin.settings.captcha.sceneRegister'), 'on_register', t('admin.settings.captcha.sceneRegisterHint'))}
            {scene(t('admin.settings.captcha.sceneLogin'), 'on_login', t('admin.settings.captcha.sceneLoginHint'))}
            {scene(t('admin.settings.captcha.sceneComment'), 'on_comment', t('admin.settings.captcha.sceneCommentHint'))}
          </div>
        </div>

        {message && <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.captcha.save')}</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
