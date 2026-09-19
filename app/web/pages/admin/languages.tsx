import { useCallback, useEffect, useRef, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation, type SiteLocale } from '@/lib/i18n'
import { builtinMessages, validateMessages } from '@/lib/i18n/runtime'
import { Badge, Button, Card, Field, Input, Loading, SegmentedTabs, Select, Switch, Textarea, useFeedback } from '@/components/ui'

interface Registry { items: SiteLocale[]; revision: number }
interface Bundle { locale: string; revision: number; draft: Record<string, string>; published: Record<string, string> }

// 语言管理：独立的后台左侧菜单（站点语言注册表 + 界面语言包）
export default function AdminLanguages() {
  const { user } = useApp()
  const { t, refreshLanguages } = useTranslation()
  const { showToast } = useFeedback()
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [tab, setTab] = useState('languages')
  const [selected, setSelected] = useState('')
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [editor, setEditor] = useState('{}')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const bundleRequest = useRef(0)
  const load = useCallback(async () => {
    if (user?.role !== 'admin') return
    setLoading(true); setError('')
    try { const result = await api<Registry>('/admin/i18n/locales'); setRegistry(result); setSelected((old) => old || result.items[0]?.code || '') }
    catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }, [user?.role])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!selected || tab !== 'messages' || user?.role !== 'admin') return
    const request = ++bundleRequest.current
    setLoading(true); setError(''); setBundle(null)
    api<Bundle>('/admin/i18n/messages/' + encodeURIComponent(selected)).then((result) => {
      if (request !== bundleRequest.current) return
      setBundle(result); setEditor(JSON.stringify(result.draft, null, 2))
    }).catch((cause) => { if (request === bundleRequest.current) setError((cause as Error).message) })
      .finally(() => { if (request === bundleRequest.current) setLoading(false) })
    return () => { bundleRequest.current = request + 1 }
  }, [selected, tab, user?.role])

  function change(index: number, patch: Partial<SiteLocale>) {
    if (!registry) return
    setRegistry({ ...registry, items: registry.items.map((row, i) => i === index ? { ...row, ...patch } : patch.is_default ? { ...row, is_default: false } : row) })
  }
  async function saveRegistry() {
    setSaving(true); setError('')
    try {
      setRegistry(await api<Registry>('/admin/i18n/locales', { method: 'PUT', body: registry }))
      await refreshLanguages(); showToast({ message: t('i18n.saved'), tone: 'success' })
    } catch (cause) { setError((cause as Error).message) }
    finally { setSaving(false) }
  }
  async function saveBundle(publish: boolean) {
    if (!bundle) return
    setSaving(true); setError('')
    try {
      const messages = JSON.parse(editor)
      if (!messages || typeof messages !== 'object' || Array.isArray(messages)) throw new Error(t('i18n.invalidJSON'))
      if (publish) validateMessages(messages)
      const result = await api<Bundle>('/admin/i18n/messages/' + encodeURIComponent(bundle.locale), { method: 'PUT', body: { messages, revision: bundle.revision, publish } })
      setBundle(result); await refreshLanguages(); showToast({ message: t('i18n.saved'), tone: 'success' })
    } catch (cause) { setError((cause as Error).message) }
    finally { setSaving(false) }
  }
  function exportBundle() {
    const url = URL.createObjectURL(new Blob([editor], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = selected + '.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function importBundle(file?: File) {
    if (!file) return
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error(t('i18n.tooLarge'))
      const value = JSON.parse(await file.text()); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(t('i18n.invalidJSON'))
      setEditor(JSON.stringify(value, null, 2))
    } catch (cause) { setError((cause as Error).message) }
  }

  return <AdminLayout current="languages" breadcrumb={t('i18n.title')}>
    <div className="mb-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><i className="fa-solid fa-language text-primary-600" aria-hidden="true" />{t('i18n.title')}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{t('i18n.settingsDescription')}</p>
    </div>
    <SegmentedTabs value={tab} onChange={setTab} ariaLabel={t('i18n.title')} items={[{ value: 'languages', label: t('i18n.languages') }, { value: 'messages', label: t('i18n.messages') }]} />
    {error && <Card role="alert" className="my-4 max-h-40 overflow-auto break-words border-rose-200 p-4 text-rose-700">{error}</Card>}
    {loading && !registry && <Loading className="mt-4" label={t('global.pageLoading')} />}
    {!registry && !loading && <Button onClick={load}>{t('i18n.retry')}</Button>}
    {registry && tab === 'languages' && <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-500">{t('i18n.registryHint')}</p>
      {registry.items.map((row, index) => <Card key={index} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={t('i18n.code')}><Input value={row.code} onChange={(event) => change(index, { code: event.target.value })} /></Field>
        <Field label={t('i18n.nativeName')}><Input value={row.native_name} onChange={(event) => change(index, { native_name: event.target.value })} /></Field>
        <Field label={t('i18n.direction')}><Select value={row.direction} options={[{ value: 'ltr', label: 'LTR' }, { value: 'rtl', label: 'RTL' }]} onChange={(value) => change(index, { direction: value as 'ltr' | 'rtl' })} /></Field>
        <Field label={t('i18n.fallback')}><Select value={row.fallback_locale} options={[{ value: '', label: t('i18n.none') }, ...registry.items.filter((item) => item.enabled && item.code !== row.code).map((item) => ({ value: item.code, label: item.native_name }))]} onChange={(value) => change(index, { fallback_locale: value })} /></Field>
        {(['enabled', 'content_enabled', 'ui_enabled', 'is_default'] as const).map((key) => <Field key={key} label={t('i18n.' + key)}><Switch ariaLabel={t('i18n.' + key)} checked={row[key]} onChange={(value) => change(index, { [key]: value })} /></Field>)}
        <Field label={t('i18n.sort')}><Input type="number" value={row.sort_order} onChange={(event) => change(index, { sort_order: Number(event.target.value) || 0 })} /></Field>
      </Card>)}
      <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={async () => {
        // Code is entered in a separate controlled draft, then validated by the server.
        setRegistry({ ...registry, items: [...registry.items, { code: '', native_name: '', enabled: true, content_enabled: true, ui_enabled: false, is_default: false, direction: 'ltr', fallback_locale: registry.items.find((item) => item.is_default)?.code || '', sort_order: registry.items.length }] })
      }}>{t('i18n.addLanguage')}</Button><Button loading={saving} onClick={saveRegistry}>{t('i18n.saveLanguages')}</Button></div>
    </div>}
    {registry && tab === 'messages' && <Card className="mt-4 space-y-4 p-5">
      <Field label={t('i18n.languages')}><Select value={selected} disabled={saving} onChange={setSelected} options={registry.items.filter((item) => item.code).map((item) => ({ value: item.code, label: item.native_name }))} /></Field>
      {loading && <Loading className="py-6" label={t('global.pageLoading')} />}
      {!loading && bundle && <>
        <div className="flex flex-wrap gap-3"><Badge>{t('i18n.publishedKeys', { count: Object.keys(bundle.published).length })}</Badge><Badge>{t('i18n.baseKeys', { count: Object.keys(builtinMessages.en).length })}</Badge></div>
        <p className="text-sm text-slate-500">{t('i18n.bundleHint')}</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => fileRef.current?.click()}>{t('i18n.import')}</Button><Button variant="outline" onClick={exportBundle}>{t('i18n.export')}</Button><Button variant="ghost" onClick={() => setEditor(JSON.stringify(builtinMessages[selected] || builtinMessages.en, null, 2))}>{t('i18n.loadTemplate')}</Button></div>
        <input ref={fileRef} type="file" hidden accept="application/json,.json" onChange={(event) => { void importBundle(event.target.files?.[0]); event.target.value = '' }} />
        <Textarea aria-label={t('i18n.messages')} dir="ltr" className="font-mono" rows={18} value={editor} onChange={(event) => setEditor(event.target.value)} />
        <div className="flex gap-3"><Button loading={saving} variant="outline" onClick={() => saveBundle(false)}>{t('i18n.saveDraft')}</Button><Button loading={saving} onClick={() => saveBundle(true)}>{t('i18n.publish')}</Button></div>
      </>}
    </Card>}
  </AdminLayout>
}
