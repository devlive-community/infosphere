import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Select, Switch, Loading } from '@/components/ui'

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
      setMessage('验证码设置已保存')
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
    <SettingsLayout active="captcha" description="内置验证码，无需第三方。选择类型与复杂度，并在注册、登录、评论等场景分别开启；开启后对应操作必须通过验证。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载验证码设置…" /> : (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">类型与复杂度</h3>
          <div className="space-y-5">
            <Field label="验证码类型">
              <Select
                options={[{ value: 'image', label: '图形验证码（字符）' }, { value: 'arithmetic', label: '算术题验证码' }]}
                value={cfg.type} onChange={(v) => setCfg({ ...cfg, type: v })} />
            </Field>

            {cfg.type === 'image' ? (
              <>
                <Field label="字符数量">
                  <Select options={[4, 5, 6].map((n) => ({ value: String(n), label: `${n} 位` }))}
                    value={String(cfg.length)} onChange={(v) => setCfg({ ...cfg, length: Number(v) })} />
                </Field>
                <Field label="字符集">
                  <Select options={[{ value: 'alnum', label: '字母 + 数字' }, { value: 'digit', label: '纯数字' }]}
                    value={cfg.charset} onChange={(v) => setCfg({ ...cfg, charset: v })} />
                </Field>
                <Field label="干扰强度" hint="干扰线越多越难被识别，也越难辨认。">
                  <Select options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: ['无', '低', '中', '高'][n] }))}
                    value={String(cfg.noise)} onChange={(v) => setCfg({ ...cfg, noise: Number(v) })} />
                </Field>
              </>
            ) : (
              <Field label="高难度算术" hint="开启后使用更大的数字并包含乘法。">
                <Switch ariaLabel="高难度算术" checked={cfg.arith_hard} onChange={(v) => setCfg({ ...cfg, arith_hard: v })} />
              </Field>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">启用位置</h3>
          <div className="space-y-5">
            {scene('注册', 'on_register', '注册页要求填写验证码。')}
            {scene('登录', 'on_login', '登录页要求填写验证码。')}
            {scene('发表评论', 'on_comment', '章节评论提交时要求填写验证码。')}
          </div>
        </div>

        {message && <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="flex justify-end">
          <Button loading={saving} onClick={save}>保存配置</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
