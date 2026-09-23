type TFn = (key: string, vars?: Record<string, string | number>) => string

// growthRuleLabel 经验规则显示名：优先 i18n（growth.rule.<key>），回退库中 label / 规则键。
export function growthRuleLabel(t: TFn, key: string, fallback?: string): string {
  const k = `growth.rule.${key}`
  const v = t(k)
  return v === k ? (fallback || key) : v
}

// growthReasonLabel 经验流水说明：系统原因码（如 revoked）按 growth.reason.<码> 翻译，其余（管理员填写的原因）原样显示。
export function growthReasonLabel(t: TFn, reason?: string): string {
  if (!reason) return ''
  const k = `growth.reason.${reason}`
  const v = t(k)
  return v === k ? reason : v
}
