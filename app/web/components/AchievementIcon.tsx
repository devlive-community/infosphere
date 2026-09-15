import { resolveMediaUrl } from '@/lib/media'
import type { AchievementDefinition } from '@/lib/types'

const sizeClasses = {
  sm: 'h-10 w-10 text-lg',
  md: 'h-14 w-14 text-2xl',
  lg: 'h-20 w-20 text-3xl',
}

export default function AchievementIcon({ achievement, size = 'md', muted = false }: {
  achievement: Pick<AchievementDefinition, 'name' | 'icon_type' | 'icon_value'>
  size?: keyof typeof sizeClasses
  muted?: boolean
}) {
  const classes = `${sizeClasses[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border ${
    muted ? 'border-slate-200 bg-slate-100 text-slate-400 grayscale' : 'border-primary-100 bg-primary-50 text-primary-600'
  }`
  if (achievement.icon_type === 'fa') {
    return <span className={classes}><i className={`fa-solid ${achievement.icon_value || 'fa-trophy'}`} aria-hidden="true" /></span>
  }
  return (
    <span className={classes}>
      <img src={resolveMediaUrl(achievement.icon_value)} alt={achievement.name} className="h-full w-full object-contain p-1" />
    </span>
  )
}
