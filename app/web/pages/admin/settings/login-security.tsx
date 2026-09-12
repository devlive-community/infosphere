import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Input, Switch, Select, Loading } from '@/components/ui'

interface LoginSecurity {
  lockout_enabled: boolean
  lockout_threshold: number
  lockout_window: number
  lockout_duration: number
  password_min_length: number
  password_require_mixed: boolean
}

// 系统设置 · 登录安全：登录失败锁定 + 密码策略（仅管理员）
export default function SettingsLoginSecurity() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [cfg, setCfg] = useState<LoginSecurity>({
    lockout_enabled: false, lockout_threshold: 5, lockout_window: 15, lockout_duration: 15,
    password_min_length: 6, password_require_mixed: false,
  })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<LoginSecurity>('/login-security').then(setCfg).catch((e) => setMessage((e as Error).message)).finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await api<LoginSecurity>('/login-security', { method: 'PUT', body: cfg })
      setCfg(saved)
      setMessage('登录安全设置已保存')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const numOptions = (values: number[], suffix: string) => values.map((n) => ({ value: String(n), label: `${n} ${suffix}` }))

  return (
    <SettingsLayout active="login-security" description="防止暴力破解与弱密码：登录连续失败可临时锁定账户，并对新密码强制最小长度与复杂度。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载登录安全设置…" /> : (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">登录失败锁定</h3>
          <div className="space-y-5">
            <Field label="启用登录失败锁定" hint="开启后，短时间内连续登录失败会临时锁定该账户。">
              <Switch ariaLabel="启用登录失败锁定" checked={cfg.lockout_enabled} onChange={(v) => setCfg({ ...cfg, lockout_enabled: v })} />
            </Field>
            <Field label="失败次数阈值" hint="统计窗口内连续失败达到该次数即锁定。">
              <Select options={numOptions([3, 5, 8, 10], '次')} value={String(cfg.lockout_threshold)} onChange={(v) => setCfg({ ...cfg, lockout_threshold: Number(v) })} />
            </Field>
            <Field label="统计窗口" hint="在多长时间内累计失败次数。">
              <Select options={numOptions([5, 10, 15, 30, 60], '分钟')} value={String(cfg.lockout_window)} onChange={(v) => setCfg({ ...cfg, lockout_window: Number(v) })} />
            </Field>
            <Field label="锁定时长" hint="触发锁定后，账户需等待多久才能再次登录。">
              <Select options={numOptions([5, 15, 30, 60, 120], '分钟')} value={String(cfg.lockout_duration)} onChange={(v) => setCfg({ ...cfg, lockout_duration: Number(v) })} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">密码策略</h3>
          <div className="space-y-5">
            <Field label="密码最小长度" hint="注册、修改密码、找回密码都会强制该长度（最低 6）。">
              <span className="inline-block w-24">
                <Input type="number" min={6} max={64} value={cfg.password_min_length}
                  onChange={(e) => setCfg({ ...cfg, password_min_length: Math.max(6, Math.min(64, Number(e.target.value) || 6)) })}
                  className="text-center" aria-label="密码最小长度" />
              </span>
            </Field>
            <Field label="需同时包含字母和数字" hint="开启后，弱密码（纯数字/纯字母）将被拒绝。">
              <Switch ariaLabel="需同时包含字母和数字" checked={cfg.password_require_mixed} onChange={(v) => setCfg({ ...cfg, password_require_mixed: v })} />
            </Field>
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
