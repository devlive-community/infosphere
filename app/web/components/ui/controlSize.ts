import type { CSSProperties } from 'react'

export type ControlSize = 'sm' | 'md' | 'lg'

export const controlHeight: Record<ControlSize, string> = {
  sm: 'var(--control-height-sm)',
  md: 'var(--control-height)',
  lg: 'var(--control-height-lg)',
}

// 控件的 size 只允许映射到同一套主题变量，业务页面不得自行指定固定高度。
export function sizedControlStyle(size: ControlSize, style?: CSSProperties): CSSProperties {
  return { ...style, height: controlHeight[size] }
}
