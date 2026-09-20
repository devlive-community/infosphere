import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import FeatureGate from '@/components/FeatureGate'
import ResourceIcon from '@/components/ResourceIcon'
import IconPicker from '@/components/IconPicker'
import { api } from '@/lib/api'
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, Select, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface Level {
  id: number
  level: number
  name: string
  description?: string
  icon_type?: string
  icon_value?: string
  color?: string
  min_xp: number
  status: string
}

interface LevelForm { id?: number; level: number; name: string; description: string; icon_type: string; icon_value: string; color: string; min_xp: number; status: string }

export default function AdminGrowth() {
  return <FeatureGate feature="growth"><AdminGrowthInner /></FeatureGate>
}

function AdminGrowthInner() {
  const { t } = useTranslation()
  const { showToast, confirmAction } = useFeedback()
  const [levels, setLevels] = useState<Level[] | null>(null)
  const [form, setForm] = useState<LevelForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [adjUser, setAdjUser] = useState('')
  const [adjXP, setAdjXP] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const load = useCallback(() => {
    api<{ items: Level[] }>('/admin/growth/levels').then((r) => setLevels(r.items || [])).catch((e) => showToast({ title: t('admin.growth.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [showToast, t])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form || !form.name.trim()) return
    setSaving(true)
    try {
      const path = form.id ? `/admin/growth/levels/${form.id}` : '/admin/growth/levels'
      await api(path, { method: form.id ? 'PUT' : 'POST', body: {
        level: form.level, name: form.name.trim(), description: form.description,
        icon_type: form.icon_type, icon_value: form.icon_value, color: form.color, min_xp: form.min_xp, status: form.status,
      } })
      setForm(null); load()
      showToast({ message: t('admin.growth.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('admin.growth.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally { setSaving(false) }
  }

  async function remove(lv: Level) {
    if (!(await confirmAction({ title: t('admin.growth.deleteTitle'), message: t('admin.growth.deleteMessage', { name: lv.name }), confirmLabel: t('common.actions.delete'), danger: true }))) return
    try { await api(`/admin/growth/levels/${lv.id}`, { method: 'DELETE' }); load(); showToast({ message: t('admin.growth.deleted'), tone: 'success' }) }
    catch (e) { showToast({ title: t('admin.growth.saveFailed'), message: (e as Error).message, tone: 'error' }) }
  }

  async function adjust() {
    if (!adjUser.trim() || !adjXP.trim() || !adjReason.trim()) { showToast({ message: t('admin.growth.adjustRequired'), tone: 'error' }); return }
    setAdjusting(true)
    try {
      await api('/admin/growth/adjust', { method: 'POST', body: { username: adjUser.trim(), xp: Number(adjXP), reason: adjReason.trim() } })
      setAdjUser(''); setAdjXP(''); setAdjReason('')
      showToast({ message: t('admin.growth.adjustDone'), tone: 'success' })
    } catch (e) { showToast({ title: t('admin.growth.adjustFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setAdjusting(false) }
  }

  const nextLevel = levels ? (levels.reduce((m, l) => Math.max(m, l.level), 0) + 1) : 1

  return (
    <AdminLayout current="growth" breadcrumb={t('admin.nav.growth')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.nav.growth')}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t('admin.growth.description')}</p>
        </div>
        <Button onClick={() => setForm({ level: nextLevel, name: `Lv.${nextLevel}`, description: '', icon_type: 'fa', icon_value: 'fa-star', color: '', min_xp: 0, status: 'active' })}>
          <i className="fa-solid fa-plus" aria-hidden="true" /> {t('admin.growth.addLevel')}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {levels === null ? <Loading className="py-16" label={t('admin.growth.loading')} /> : levels.length === 0 ? (
            <EmptyState>{t('admin.growth.empty')}</EmptyState>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr><th className="px-4 py-3">{t('admin.growth.col.level')}</th><th className="px-4 py-3">{t('admin.growth.col.minXp')}</th><th className="px-4 py-3">{t('admin.growth.col.status')}</th><th className="px-4 py-3 text-right">{t('admin.growth.col.action')}</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {levels.map((lv) => (
                    <tr key={lv.id}>
                      <td className="px-4 py-3"><span className="flex items-center gap-2.5"><ResourceIcon iconType={lv.icon_type} iconValue={lv.icon_value} fallback="fa-star" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary-100 bg-primary-50 text-primary-600" /><span className="font-medium text-slate-800">{lv.name}</span></span></td>
                      <td className="px-4 py-3 text-slate-500">{lv.min_xp}</td>
                      <td className="px-4 py-3"><Badge tone={lv.status === 'active' ? 'emerald' : 'slate'}>{t(`admin.growth.status.${lv.status}`)}</Badge></td>
                      <td className="px-4 py-3 text-right"><span className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setForm({ id: lv.id, level: lv.level, name: lv.name, description: lv.description || '', icon_type: lv.icon_type || 'fa', icon_value: lv.icon_value || 'fa-star', color: lv.color || '', min_xp: lv.min_xp, status: lv.status })}>{t('common.actions.edit')}</Button>{lv.level !== 1 && <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => remove(lv)}>{t('common.actions.delete')}</Button>}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* 人工调整经验 */}
        <Card className="h-fit p-5">
          <h2 className="font-bold text-slate-900">{t('admin.growth.adjustTitle')}</h2>
          <p className="mt-1 text-xs text-slate-400">{t('admin.growth.adjustHint')}</p>
          <div className="mt-4 space-y-3">
            <Field label={t('admin.growth.adjustUser')}><Input value={adjUser} onChange={(e) => setAdjUser(e.target.value)} placeholder="username" /></Field>
            <Field label={t('admin.growth.adjustXp')}><Input type="number" value={adjXP} onChange={(e) => setAdjXP(e.target.value)} placeholder="100 / -50" /></Field>
            <Field label={t('admin.growth.adjustReason')}><Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} /></Field>
            <div className="flex justify-end"><Button loading={adjusting} onClick={adjust}>{t('admin.growth.adjustSubmit')}</Button></div>
          </div>
        </Card>
      </div>

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? t('admin.growth.editLevel') : t('admin.growth.addLevel')}
        footer={<><Button variant="outline" onClick={() => setForm(null)}>{t('common.actions.cancel')}</Button><Button loading={saving} onClick={save}>{t('common.actions.save')}</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('admin.growth.form.level')}><Input type="number" min={1} value={form.level} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, level: Number(e.target.value) || 1 })} /></Field>
              <Field label={t('admin.growth.form.minXp')} hint={form.level === 1 ? t('admin.growth.form.level1Zero') : undefined}><Input type="number" min={0} value={form.min_xp} disabled={form.level === 1} onChange={(e) => setForm({ ...form, min_xp: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            </div>
            <Field label={t('admin.growth.form.name')}><Input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('admin.growth.form.icon')}><IconPicker value={{ icon_type: form.icon_type, icon_value: form.icon_value }} onChange={(v) => setForm({ ...form, icon_type: v.icon_type || 'fa', icon_value: v.icon_value })} fallback="fa-star" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('admin.growth.form.color')}><Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#6366f1" /></Field>
              <Field label={t('admin.growth.form.status')}>
                <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })}
                  options={[{ value: 'active', label: t('admin.growth.status.active') }, { value: 'archived', label: t('admin.growth.status.archived') }]} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}
