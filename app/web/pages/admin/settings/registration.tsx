import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Select, Switch, Loading } from '@/components/ui'

interface RegistrationSettings {
  mode: string
  require_email: boolean
  require_activation: boolean
}

const MODE_OPTIONS = [
  { value: 'open', label: '开放注册（邀请码可填可不填）' },
  { value: 'open_invite', label: '开放注册 + 邀请码（必须填邀请码）' },
  { value: 'invite', label: '仅邀请码（只能通过邀请码注册）' },
  { value: 'closed', label: '关闭注册（含第三方登录也不能注册新号）' },
]

// 系统设置 · 注册设置：注册方式 / 绑定邮箱 / 激活邮箱（仅管理员）
export default function SettingsRegistration() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [cfg, setCfg] = useState<RegistrationSettings>({ mode: 'open', require_email: false, require_activation: false })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<RegistrationSettings>('/registration')
      .then(setCfg)
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await api<RegistrationSettings>('/registration', { method: 'PUT', body: cfg })
      setCfg(saved)
      setMessage('注册设置已保存')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="registration" description="控制新用户如何注册：注册方式、是否必须绑定邮箱、以及是否必须激活邮箱后才能创建内容。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载注册设置…" /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          <Field label="注册方式" hint="邀请码为每个用户专属，可在个人中心查看并分享。">
            <Select options={MODE_OPTIONS} value={cfg.mode} onChange={(v) => setCfg({ ...cfg, mode: v })} />
          </Field>

          <Field label="注册必须绑定邮箱" hint="开启后注册必须填写邮箱；关闭则邮箱可留空。">
            <Switch ariaLabel="注册必须绑定邮箱" checked={cfg.require_email} onChange={(v) => setCfg({ ...cfg, require_email: v })} />
          </Field>

          <Field label="注册后必须激活邮箱" hint="需先开启「绑定邮箱」才生效。开启后，未激活邮箱的用户只能只读浏览，激活后才能创建书籍、发表评论等。">
            <Switch ariaLabel="注册后必须激活邮箱" checked={cfg.require_activation} disabled={!cfg.require_email} onChange={(v) => setCfg({ ...cfg, require_activation: v })} />
          </Field>
        </div>

        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>保存配置</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
