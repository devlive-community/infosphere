import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Field, Input, Switch, Loading } from '@/components/ui'

interface ContentSettings {
  upload_max_mb: number
  upload_allowed_exts: string
  comments_enabled: boolean
}

// 系统设置 · 内容设置：上传限制与全站评论开关（仅管理员）
export default function SettingsContent() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [cfg, setCfg] = useState<ContentSettings>({ upload_max_mb: 10, upload_allowed_exts: '', comments_enabled: true })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<ContentSettings>('/content-settings').then(setCfg).catch((e) => setMessage((e as Error).message)).finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const saved = await api<ContentSettings>('/content-settings', { method: 'PUT', body: cfg })
      setCfg(saved)
      setMessage('内容设置已保存')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="content" description="控制图片上传的大小与类型限制，以及全站评论开关。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载内容设置…" /> : (
      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">上传限制</h3>
          <div className="space-y-5">
            <Field label="最大文件大小（MB）" hint="单个上传文件的大小上限（1-100）。">
              <span className="inline-block w-24">
                <Input type="number" min={1} max={100} value={cfg.upload_max_mb}
                  onChange={(e) => setCfg({ ...cfg, upload_max_mb: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                  className="text-center" aria-label="最大文件大小" />
              </span>
            </Field>
            <Field label="允许的文件类型" hint="扩展名，逗号分隔，如 .png,.jpg,.webp。留空则用内置图片类型。">
              <Input value={cfg.upload_allowed_exts} onChange={(e) => setCfg({ ...cfg, upload_allowed_exts: e.target.value })}
                placeholder=".png,.jpg,.jpeg,.gif,.webp,.svg,.ico" aria-label="允许的文件类型" />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-900">评论</h3>
          <Field label="开启全站评论" hint="关闭后，所有章节的评论提交都会被拒绝，评论框隐藏（已有评论仍可查看）。">
            <Switch ariaLabel="开启全站评论" checked={cfg.comments_enabled} onChange={(v) => setCfg({ ...cfg, comments_enabled: v })} />
          </Field>
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
