import { useState } from 'react'
import { api, API_BASE, getToken } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Textarea, Field, Switch, Select } from '@/components/ui'

// 系统设置 · 站点设置：站点名称、描述、Logo 与全站公告（仅管理员）
export default function SettingsSite() {
  const { site } = useApp()
  const [siteName, setSiteName] = useState(site.site_name || '')
  const [siteDesc, setSiteDesc] = useState(site.site_description || '')
  const [siteLogo, setSiteLogo] = useState(site.site_logo || '')
  const [uploading, setUploading] = useState(false)
  const [annEnabled, setAnnEnabled] = useState(site.announcement_enabled === 'true')
  const [annText, setAnnText] = useState(site.announcement_text || '')
  const [annTone, setAnnTone] = useState(site.announcement_tone === 'warning' ? 'warning' : 'info')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function uploadLogo(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_BASE}/api/v1/upload`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload.success === false) throw new Error(payload.message || '上传失败')
      setSiteLogo(payload.data.url)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api('/site', { method: 'PUT', body: {
        site_name: siteName, site_description: siteDesc, site_logo: siteLogo,
        announcement_enabled: annEnabled, announcement_text: annText, announcement_tone: annTone,
      } })
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
          <Field label="站点 Logo" hint="显示在页头与页脚；建议使用正方形透明背景图片。留空则使用默认 Logo。">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img src={siteLogo ? resolveMediaUrl(siteLogo) : '/logo.png'} alt="站点 Logo" className="h-full w-full object-contain" />
              </span>
              <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50">
                {uploading ? '上传中…' : '上传 Logo'}
                <input type="file" accept="image/*" hidden disabled={uploading}
                  onChange={(e) => { void uploadLogo(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {siteLogo && <Button type="button" variant="ghost" className="text-slate-500" onClick={() => setSiteLogo('')}>恢复默认</Button>}
            </div>
          </Field>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">全站公告</h3>
            <div className="space-y-4">
              <Field label="显示公告横幅" hint="开启后在全站顶部显示一条可关闭的公告。">
                <Switch ariaLabel="显示公告横幅" checked={annEnabled} onChange={setAnnEnabled} />
              </Field>
              <Field label="公告内容">
                <Textarea rows={2} value={annText} onChange={(e) => setAnnText(e.target.value)} placeholder="例如：系统将于今晚 22:00 维护，预计 30 分钟。" />
              </Field>
              <Field label="样式">
                <Select options={[{ value: 'info', label: '普通（蓝）' }, { value: 'warning', label: '警示（琥珀）' }]}
                  value={annTone} onChange={setAnnTone} />
              </Field>
            </div>
          </div>
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>保存站点设置</Button>
        </div>
      </div>
    </SettingsLayout>
  )
}
