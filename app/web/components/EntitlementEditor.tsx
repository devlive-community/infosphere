import { Input, Select, Switch, Checkbox } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { UNLIMITED, entitlementLabel, type EntitlementDef } from '@/lib/entitlements'

// EntitlementEditor 权益编辑器：
//   - mode="base"：全站基础值，每项都必须有值（开关 / 数值，可选「不限」）；
//   - mode="source"：等级、会员方案等来源，每项可「不设置」（沿用更低优先级来源或基础值），设置时同上。
export default function EntitlementEditor({ defs, value, onChange, mode, unavailable }: {
  defs: EntitlementDef[]
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
  mode: 'base' | 'source'
  /** 不可用的权益键（如所属插件已禁用），展示为禁用 */
  unavailable?: Set<string>
}) {
  const { t } = useTranslation()

  function set(key: string, v: number | undefined) {
    const next = { ...value }
    if (v === undefined) delete next[key]
    else next[key] = v
    onChange(next)
  }
  const clamp = (def: EntitlementDef, n: number) => Math.min(def.max, Math.max(def.min, Math.round(n) || def.min))

  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {defs.map((def) => {
        const v = value[def.key]
        const isSet = v !== undefined
        const disabled = unavailable?.has(def.key)
        const hint = (() => { const k = `entitlement.${def.key}.hint`; const s = t(k); return s === k ? '' : s })()
        return (
          <div key={def.key} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${disabled ? 'opacity-50' : ''}`}>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{entitlementLabel(t, def.key)}</div>
              {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {mode === 'source' && def.kind === 'flag' ? (
                <span className="block w-36">
                  <Select value={isSet ? String(v) : ''} disabled={disabled} onChange={(s) => set(def.key, s === '' ? undefined : Number(s))}
                    options={[{ value: '', label: t('entitlement.notSet') }, { value: '1', label: t('entitlement.on') }, { value: '0', label: t('entitlement.off') }]} />
                </span>
              ) : def.kind === 'flag' ? (
                <Switch ariaLabel={entitlementLabel(t, def.key)} checked={(v ?? 0) > 0} disabled={disabled} onChange={(on) => set(def.key, on ? 1 : 0)} />
              ) : (
                <>
                  {mode === 'source' && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                      <Checkbox checked={isSet} disabled={disabled} ariaLabel={t('entitlement.setValue')} onChange={(on) => set(def.key, on ? (def.allow_unlimited ? UNLIMITED : def.min) : undefined)} />
                      {t('entitlement.setValue')}
                    </label>
                  )}
                  {def.allow_unlimited && (mode === 'base' || isSet) && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                      <Checkbox checked={v === UNLIMITED} disabled={disabled} ariaLabel={t('entitlement.unlimited')} onChange={(on) => set(def.key, on ? UNLIMITED : def.min)} />
                      {t('entitlement.unlimited')}
                    </label>
                  )}
                  <span className="block w-32">
                    <Input type="number" min={def.min} max={def.max} disabled={disabled || (mode === 'source' && !isSet) || v === UNLIMITED}
                      value={v === undefined || v === UNLIMITED ? '' : v}
                      placeholder={mode === 'source' && !isSet ? t('entitlement.notSet') : v === UNLIMITED ? t('entitlement.unlimited') : ''}
                      onChange={(e) => set(def.key, clamp(def, Number(e.target.value)))}
                      trailing={<span className="text-xs text-slate-400">{t(`entitlement.unitShort.${def.unit}`)}</span>} />
                  </span>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
