import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Loading } from '@/components/ui'
import { MailConfig, emptyMail } from '@/lib/admin'

// 系统设置 · 邮件服务：SMTP 配置与找回密码发信（仅管理员）
export default function SettingsMail() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [mail, setMail] = useState<MailConfig>(emptyMail)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<MailConfig>('/mail')
      .then(setMail)
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api('/mail', { method: 'PUT', body: mail })
      setMessage('邮件配置已保存')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="mail" description="配置 SMTP 后用户可通过邮箱找回密码；「日志驱动」不真实发信，重置链接会输出到后端日志（开发期使用）。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载邮件配置…" /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="发信驱动">
              <Select
                options={[{ value: 'log', label: '日志驱动（开发）' }, { value: 'smtp', label: 'SMTP' }]}
                value={mail.driver || 'log'} onChange={(v) => setMail({ ...mail, driver: v })} />
            </Field>
            <Field label="SMTP 端口" hint="465 使用隐式 TLS，587 自动 STARTTLS">
              <Input type="number" value={mail.port || ''} onChange={(e) => setMail({ ...mail, port: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="站点访问地址" hint="找回密码邮件中的链接将以此为前缀，例如 https://kb.example.com">
            <Input value={mail.site_url || ''} onChange={(e) => setMail({ ...mail, site_url: e.target.value })}
              placeholder="https://kb.example.com" />
          </Field>
          <Field label="SMTP 主机">
            <Input value={mail.host || ''} onChange={(e) => setMail({ ...mail, host: e.target.value })}
              placeholder="smtp.example.com" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="SMTP 用户名">
              <Input value={mail.username || ''} onChange={(e) => setMail({ ...mail, username: e.target.value })} />
            </Field>
            <Field label="SMTP 密码">
              <Input type="password" value={mail.password || ''} onChange={(e) => setMail({ ...mail, password: e.target.value })} />
            </Field>
          </div>
          <Field label="发件人地址">
            <Input value={mail.from || ''} onChange={(e) => setMail({ ...mail, from: e.target.value })}
              placeholder="noreply@example.com" />
          </Field>
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>保存邮件配置</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
