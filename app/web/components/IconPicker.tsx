import { useRef, useState } from 'react'
import { API_BASE, getToken } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Button, Input, Select, useFeedback } from '@/components/ui'
import ResourceIcon from './ResourceIcon'

export interface IconValue { icon_type: string; icon_value: string }

// IconPicker 通用图标选择器：fa 类名 / 上传 image / 上传 svg。上传走通用 /upload 端点，返回媒体地址。
// 供标签管理等处复用；受控组件，value/onChange 传 { icon_type, icon_value }。
export default function IconPicker({ value, onChange, fallback }: {
  value: IconValue
  onChange: (next: IconValue) => void
  fallback?: string
}) {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file?: File) {
    if (!file) return
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${API_BASE}/api/v1/upload`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload.success === false) throw new Error(payload.message || t('iconPicker.uploadFailed'))
      const url = payload.data?.url as string
      const isSvg = file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')
      onChange({ icon_type: isSvg ? 'svg' : 'image', icon_value: url })
    } catch (e) {
      showToast({ title: t('iconPicker.uploadFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-start gap-3">
      <ResourceIcon iconType={value.icon_type} iconValue={value.icon_value} fallback={fallback} />
      <div className="min-w-0 flex-1 space-y-2">
        <Select value={value.icon_type || ''} onChange={(v) => onChange({ icon_type: v, icon_value: v === value.icon_type ? value.icon_value : '' })}
          options={[
            { value: '', label: t('iconPicker.none') },
            { value: 'fa', label: t('iconPicker.fa') },
            { value: 'image', label: t('iconPicker.image') },
            { value: 'svg', label: t('iconPicker.svg') },
          ]} />
        {value.icon_type === 'fa' && (
          <Input value={value.icon_value} onChange={(e) => onChange({ ...value, icon_value: e.target.value })} placeholder="fa-hashtag" />
        )}
        {(value.icon_type === 'image' || value.icon_type === 'svg') && (
          <div className="flex items-center gap-2">
            <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>{t('iconPicker.upload')}</Button>
            {value.icon_value && <span className="truncate text-xs text-slate-400">{value.icon_value}</span>}
          </div>
        )}
        <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
