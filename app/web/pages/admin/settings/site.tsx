import { useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Textarea, Field } from '@/components/ui'

// 系统设置 · 站点设置：站点名称与描述（仅管理员）
export default function SettingsSite() {
  const { site } = useApp()
  const [siteName, setSiteName] = useState(site.site_name || '')
  const [siteDesc, setSiteDesc] = useState(site.site_description || '')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api('/site', { method: 'PUT', body: { site_name: siteName, site_description: siteDesc } })
      setMessage('站点设置已保存，刷新页面后全站生效。')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="site" description="维护站点名称与描述，用于页面标题、页脚与社交分享卡片。">
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <Field label="站点名称">
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="InfoSphere" />
          </Field>
          <Field label="站点描述" hint="将用于首页与搜索引擎摘要">
            <Textarea rows={3} value={siteDesc} onChange={(e) => setSiteDesc(e.target.value)}
              placeholder="开源自托管的知识管理系统" />
          </Field>
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>保存站点设置</Button>
        </div>
      </div>
    </SettingsLayout>
  )
}
