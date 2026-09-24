import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import EntitlementEditor from '@/components/EntitlementEditor'
import { Button, Loading, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import type { EntitlementDef } from '@/lib/entitlements'

interface BaseItem extends EntitlementDef { base: number; available: boolean }

// 系统设置 · 权益：全站基础权益（所有用户的默认值）。默认与升级前一致（书籍/协作者不限，上传与采集沿用原设置），
// 在此收紧后生效；成长等级、会员方案可为特定用户放宽（由对应插件配置）。
export default function SettingsEntitlements() {
  const { user, refreshUser } = useApp()
  const isAdmin = user?.role === 'admin'
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [items, setItems] = useState<BaseItem[] | null>(null)
  const [values, setValues] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  function apply(list: BaseItem[]) {
    setItems(list)
    setValues(Object.fromEntries(list.map((i) => [i.key, i.base])))
  }
  useEffect(() => {
    if (!isAdmin) return
    api<{ items: BaseItem[] }>('/admin/entitlements').then((r) => apply(r.items || []))
      .catch((e) => showToast({ title: t('admin.settings.entitlements.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true)
    try {
      const r = await api<{ items: BaseItem[] }>('/admin/entitlements/base', { method: 'PUT', body: { values } })
      apply(r.items || [])
      await refreshUser().catch(() => undefined)
      showToast({ message: t('admin.settings.entitlements.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('admin.settings.entitlements.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally { setSaving(false) }
  }

  return (
    <SettingsLayout active="entitlements" description={t('admin.settings.entitlements.description')}>
      {!items ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" /> : (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-xs leading-5 text-slate-500">{t('admin.settings.entitlements.hint')}</p>
          <EntitlementEditor mode="base" defs={items} value={values} onChange={setValues}
            unavailable={new Set(items.filter((i) => !i.available).map((i) => i.key))} />
          <div className="mt-6 flex justify-end">
            <Button loading={saving} onClick={save}>{t('common.actions.save')}</Button>
          </div>
        </div>
      )}
    </SettingsLayout>
  )
}
