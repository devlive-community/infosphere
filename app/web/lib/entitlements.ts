import type { User } from '@/lib/types'

type TFn = (key: string, vars?: Record<string, string | number>) => string

export const UNLIMITED = -1

/** 权益定义（与服务端 plugincore.EntitlementDef 一致） */
export interface EntitlementDef {
  key: string
  kind: 'limit' | 'flag'
  unit: string
  min: number
  max: number
  allow_unlimited: boolean
}

export interface ResolvedEntitlement { key: string; value: number; source: string }

// entitlementAllowed 开关型权益是否可用：已登录且服务端下发了该权益时按权益；否则回退站点级开关（游客/旧接口）。
export function entitlementAllowed(user: User | null | undefined, key: string, fallback: boolean): boolean {
  const v = user?.entitlements?.[key]
  return v === undefined ? fallback : v > 0
}

// entitlementLabel 权益名称（i18n：entitlement.<key>.label，缺失时回退键名）。
export function entitlementLabel(t: TFn, key: string): string {
  const k = `entitlement.${key}.label`
  const v = t(k)
  return v === k ? key : v
}

// formatEntitlement 权益取值的展示文案：开关 → 开/关；数值 → 「不限」或「N 单位」。
export function formatEntitlement(t: TFn, def: EntitlementDef | undefined, value: number): string {
  if (!def) return String(value)
  if (def.kind === 'flag') return value > 0 ? t('entitlement.on') : t('entitlement.off')
  if (value === UNLIMITED) return t('entitlement.unlimited')
  return t(`entitlement.unit.${def.unit}`, { n: value })
}
