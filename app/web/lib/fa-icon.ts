// faIconClass 将章节 <!-- icon: xxx --> 元数据归一化为 FontAwesome 类名。
// 支持可选的样式前缀（solid/regular/light/thin/duotone/brands），默认 solid；
// 图标名可带或不带 fa- 前缀。非法或为空时返回 null（调用方回退到默认图标）。
const FA_STYLES = new Set(['solid', 'regular', 'light', 'thin', 'duotone', 'brands', 'sharp'])

export function faIconClass(raw?: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9 _-]+/g, '')
  if (!cleaned) return null
  const styles: string[] = []
  const names: string[] = []
  for (const token of cleaned.split(/\s+/)) {
    const t = token.replace(/^fa-/, '')
    if (!t) continue
    if (FA_STYLES.has(t)) styles.push(`fa-${t}`)
    else names.push(`fa-${t}`)
  }
  if (names.length === 0) return null
  const style = styles.length ? styles.join(' ') : 'fa-solid'
  // 仅取首个图标名，避免拼出多余类名
  return `${style} ${names[0]}`
}
