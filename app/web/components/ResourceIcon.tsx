import { resolveMediaUrl } from '@/lib/media'

// ResourceIcon 通用图标展示：支持 fa 图标 / 上传的 image / svg，缺省回退。
// 供标签、成就等任意资源复用（icon_type: '' | 'fa' | 'image' | 'svg'）。
export default function ResourceIcon({ iconType, iconValue, name, className, fallback = 'fa-hashtag' }: {
  iconType?: string
  iconValue?: string
  name?: string
  className?: string
  fallback?: string
}) {
  const base = className || 'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary-100 bg-primary-50 text-primary-600'
  if (iconType === 'fa' && iconValue) {
    return <span className={base}><i className={`fa-solid ${iconValue}`} aria-hidden="true" /></span>
  }
  if ((iconType === 'image' || iconType === 'svg') && iconValue) {
    return <span className={base}><img src={resolveMediaUrl(iconValue)} alt={name || ''} className="h-full w-full object-contain p-1" /></span>
  }
  return <span className={base}><i className={`fa-solid ${fallback}`} aria-hidden="true" /></span>
}
