import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AdminLayout from '@/components/AdminLayout'
import FeatureGate from '@/components/FeatureGate'
import UserAvatar from '@/components/UserAvatar'
import ModerationHits from '@/components/ModerationHits'
import { api, formatDate } from '@/lib/api'
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, Pagination, SegmentedTabs, Switch, Textarea, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { caseLink, MODERATION_STATUS_TONE, type ModerationCaseItem, type ModerationHit } from '@/lib/moderation'

type Tab = 'pending' | 'auto' | 'handled' | 'words' | 'settings'
const TABS: Tab[] = ['pending', 'auto', 'handled', 'words', 'settings']
const TAB_STATUS: Record<string, string> = { pending: 'pending', auto: 'auto_passed', handled: 'handled' }

export default function AdminModeration() {
  return <FeatureGate feature="moderation"><AdminModerationInner /></FeatureGate>
}

function AdminModerationInner() {
  const { t } = useTranslation()
  const router = useRouter()
  const tab: Tab = TABS.includes(router.query.tab as Tab) ? (router.query.tab as Tab) : 'pending' // tab 由 URL 驱动
  const [pending, setPending] = useState<number | null>(null)
  return (
    <AdminLayout current="moderation" breadcrumb={t('admin.nav.moderation')}>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.nav.moderation')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('admin.moderation.description')}</p>
      </div>
      <SegmentedTabs className="mt-6" value={tab} ariaLabel={t('admin.nav.moderation')}
        items={TABS.map((key) => ({ value: key, label: key === 'pending' && pending ? `${t('admin.moderation.tab.pending')} (${pending})` : t(`admin.moderation.tab.${key}`), href: `/admin/moderation?tab=${key}` }))} />
      <div className="mt-6">
        {TAB_STATUS[tab] && <CasesPanel key={tab} status={TAB_STATUS[tab]} onPending={setPending} />}
        {tab === 'words' && <WordsPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </AdminLayout>
  )
}

// —— 审核队列 ——

function CasesPanel({ status, onPending }: { status: string; onPending: (n: number) => void }) {
  const { t } = useTranslation()
  const { showToast, confirmAction, requestInput } = useFeedback()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: ModerationCaseItem[]; total: number; page: number; page_size: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<ModerationCaseItem | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({ status, page: String(page), page_size: '20' })
    if (q.trim()) params.set('q', q.trim())
    api<{ items: ModerationCaseItem[]; total: number; page: number; page_size: number; pending: number }>(`/admin/moderation/cases?${params}`)
      .then((r) => { setData(r); onPending(r.pending) })
      .catch((e) => showToast({ title: t('admin.moderation.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [status, page, q, onPending, showToast, t])
  useEffect(() => { load() }, [load])

  async function decide(item: ModerationCaseItem, approve: boolean) {
    let note = ''
    if (approve) {
      if (!(await confirmAction({ title: t('admin.moderation.approveTitle'), message: t(item.case.status === 'pending' ? 'admin.moderation.approveMessage' : 'admin.moderation.confirmMessage', { title: item.case.title }), confirmLabel: t('admin.moderation.approve') }))) return
    } else {
      const input = await requestInput({ title: t('admin.moderation.rejectTitle'), message: item.case.status === 'auto_passed' ? t('admin.moderation.rejectAutoHint') : undefined, label: t('admin.moderation.rejectNote'), confirmLabel: t('admin.moderation.reject') })
      if (input === null) return
      note = input.trim()
      if (!note) { showToast({ message: t('admin.moderation.noteRequired'), tone: 'error' }); return }
    }
    setBusy(`${item.case.id}:${approve ? 'approve' : 'reject'}`)
    try {
      await api(`/admin/moderation/cases/${item.case.id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: { note } })
      showToast({ message: t(approve ? 'admin.moderation.approved' : 'admin.moderation.rejected'), tone: 'success' })
      load()
    } catch (e) { showToast({ title: t('admin.moderation.opFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setBusy(null) }
  }

  return (
    <>
      <div className="mb-4 w-full sm:w-72"><Input value={q} placeholder={t('admin.moderation.search')} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></div>
      {data === null ? <Loading className="py-16" /> : data.items.length === 0 ? <EmptyState>{t(`admin.moderation.empty.${status}`)}</EmptyState> : (
        <div className="space-y-3">
          {data.items.map((item) => {
            const c = item.case
            const link = caseLink(item)
            return (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={MODERATION_STATUS_TONE[c.status]}>{t(`moderation.status.${c.status}`)}</Badge>
                      <Badge>{t(`moderation.kind.${c.kind}`)}</Badge>
                      {link ? <Link href={link} target="_blank" className="font-medium text-slate-900 hover:text-primary-600">{c.title}</Link> : <span className="font-medium text-slate-900">{c.title}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {item.user && <span className="flex items-center gap-1.5"><UserAvatar user={item.user} size="h-5 w-5" />{item.user.nickname || item.user.username}</span>}
                      {item.book && c.kind === 'document' && <span>《{item.book.title}》</span>}
                      <span>{formatDate(c.updated_at)}</span>
                    </div>
                  </div>
                  <span className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setPreview(item)}>{t('admin.moderation.viewContent')}</Button>
                    {(c.status === 'pending' || c.status === 'auto_passed') && <>
                      <Button size="sm" loading={busy === `${c.id}:approve`} disabled={!!busy} onClick={() => decide(item, true)}>{c.status === 'pending' ? t('admin.moderation.approve') : t('admin.moderation.confirm')}</Button>
                      <Button size="sm" variant="outline" className="text-rose-600" loading={busy === `${c.id}:reject`} disabled={!!busy} onClick={() => decide(item, false)}>{t('admin.moderation.reject')}</Button>
                    </>}
                  </span>
                </div>
                {c.hits.length > 0 && <div className="mt-3"><ModerationHits hits={c.hits.slice(0, 5)} />{c.hits.length > 5 && <p className="mt-1 text-xs text-slate-400">{t('admin.moderation.moreHits', { count: c.hits.length - 5 })}</p>}</div>}
                {c.review_note && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('moderation.reviewNote')}：{c.review_note}</p>}
              </Card>
            )
          })}
        </div>
      )}
      {data && data.total > data.page_size && <div className="mt-4"><Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></div>}
      {preview && <ContentModal item={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

// ContentModal 查看对象当前全文与命中位置。
function ContentModal({ item, onClose }: { item: ModerationCaseItem; onClose: () => void }) {
  const { t } = useTranslation()
  const [data, setData] = useState<{ fields: Record<string, string>; hits: ModerationHit[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<{ fields: Record<string, string>; hits: ModerationHit[] }>(`/admin/moderation/cases/${item.case.id}/content`).then(setData).catch((e) => setError((e as Error).message))
  }, [item.case.id])
  return (
    <Modal open onClose={onClose} title={item.case.title} className="max-w-3xl">
      {error ? <EmptyState>{error}</EmptyState> : !data ? <Loading className="py-10" /> : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">{t('admin.moderation.currentHits', { count: data.hits.length })}</div>
            {data.hits.length === 0 ? <p className="text-xs text-slate-400">{t('admin.moderation.noHits')}</p> : <ModerationHits hits={data.hits} />}
          </div>
          {Object.entries(data.fields).map(([field, text]) => (
            <div key={field}>
              <div className="mb-1 text-xs font-medium text-slate-500">{t(`moderation.field.${field}`)}</div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700 [overflow-wrap:anywhere]">
                {text.split('\n').map((line, i) => <span key={i} className="block"><span className="mr-3 inline-block w-8 select-none text-right text-slate-300">{i + 1}</span>{line}</span>)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// —— 敏感词词典 ——

interface WordRow { id: number; word: string; category: string; enabled: boolean; created_at: string }

function WordsPanel() {
  const { t } = useTranslation()
  const { showToast, confirmAction } = useFeedback()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: WordRow[]; total: number; page: number; page_size: number; categories: string[]; enabled_total: number } | null>(null)
  const [input, setInput] = useState('')
  const [category, setCategory] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [testText, setTestText] = useState('')
  const [testing, setTesting] = useState(false)
  const [testHits, setTestHits] = useState<ModerationHit[] | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), page_size: '30' })
    if (q.trim()) params.set('q', q.trim())
    api<{ items: WordRow[]; total: number; page: number; page_size: number; categories: string[]; enabled_total: number }>(`/admin/moderation/words?${params}`).then(setData)
      .catch((e) => showToast({ title: t('admin.moderation.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [page, q, showToast, t])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!input.trim()) return
    setAdding(true)
    try {
      const r = await api<{ added: number; skipped: number }>('/admin/moderation/words', { method: 'POST', body: { words: input, category } })
      showToast({ message: t('admin.moderation.words.added', { added: r.added, skipped: r.skipped }), tone: 'success' })
      setInput('')
      load()
    } catch (e) { showToast({ title: t('admin.moderation.opFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setAdding(false) }
  }

  async function toggle(w: WordRow, enabled: boolean) {
    setBusy(w.id)
    try { await api(`/admin/moderation/words/${w.id}`, { method: 'PUT', body: { enabled } }); load() }
    catch (e) { showToast({ title: t('admin.moderation.opFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setBusy(null) }
  }

  async function remove(w: WordRow) {
    if (!(await confirmAction({ title: t('admin.moderation.words.deleteTitle'), message: t('admin.moderation.words.deleteMessage', { word: w.word }), confirmLabel: t('common.actions.delete'), danger: true }))) return
    setBusy(w.id)
    try { await api(`/admin/moderation/words/${w.id}`, { method: 'DELETE' }); load() }
    catch (e) { showToast({ title: t('admin.moderation.opFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setBusy(null) }
  }

  async function runTest() {
    setTesting(true)
    try { setTestHits((await api<{ hits: ModerationHit[] }>('/admin/moderation/test', { method: 'POST', body: { text: testText } })).hits) }
    catch (e) { showToast({ title: t('admin.moderation.opFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setTesting(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="block w-full sm:w-64"><Input value={q} placeholder={t('admin.moderation.words.search')} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></span>
          {data && <span className="text-xs text-slate-400">{t('admin.moderation.words.stats', { total: data.total, enabled: data.enabled_total })}</span>}
        </div>
        {data === null ? <Loading className="py-16" /> : data.items.length === 0 ? <EmptyState>{t('admin.moderation.words.empty')}</EmptyState> : (
          <Card className="divide-y divide-slate-100">
            {data.items.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`truncate text-sm ${w.enabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{w.word}</span>
                  {w.category && <Badge>{w.category}</Badge>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Switch checked={w.enabled} disabled={busy === w.id} onChange={(v) => toggle(w, v)} ariaLabel={t('admin.moderation.words.enabled')} />
                  <Button size="sm" variant="ghost" className="text-rose-600" loading={busy === w.id} onClick={() => remove(w)}>{t('common.actions.delete')}</Button>
                </span>
              </div>
            ))}
          </Card>
        )}
        {data && data.total > data.page_size && <div className="mt-4"><Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} /></div>}
      </div>
      <div className="space-y-6">
        <Card className="space-y-3 p-5">
          <h2 className="font-bold text-slate-900">{t('admin.moderation.words.addTitle')}</h2>
          <Field label={t('admin.moderation.words.input')} hint={t('admin.moderation.words.inputHint')}>
            <Textarea rows={6} value={input} onChange={(e) => setInput(e.target.value)} />
          </Field>
          <Field label={t('admin.moderation.words.category')}>
            <Input value={category} maxLength={30} onChange={(e) => setCategory(e.target.value)} placeholder={data?.categories[0] || ''} />
          </Field>
          <div className="flex justify-end"><Button loading={adding} disabled={!input.trim()} onClick={add}>{t('admin.moderation.words.add')}</Button></div>
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="font-bold text-slate-900">{t('admin.moderation.test.title')}</h2>
          <Textarea rows={5} value={testText} placeholder={t('admin.moderation.test.placeholder')} onChange={(e) => setTestText(e.target.value)} />
          <div className="flex justify-end"><Button variant="outline" loading={testing} disabled={!testText.trim()} onClick={runTest}>{t('admin.moderation.test.run')}</Button></div>
          {testHits && (testHits.length === 0 ? <p className="text-xs text-emerald-600">{t('admin.moderation.noHits')}</p> : <ModerationHits hits={testHits} />)}
        </Card>
      </div>
    </div>
  )
}

// —— 设置 ——

type Settings = { scope_documents: boolean; scope_books: boolean; scope_ugc: boolean; skip_noise: boolean; notify_pass: boolean; admin_exempt: boolean }
const SETTING_KEYS: (keyof Settings)[] = ['scope_documents', 'scope_books', 'scope_ugc', 'skip_noise', 'admin_exempt', 'notify_pass']

function SettingsPanel() {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState<keyof Settings | null>(null)
  useEffect(() => {
    api<Settings>('/admin/moderation/settings').then(setSettings).catch((e) => showToast({ title: t('admin.moderation.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [showToast, t])

  // 开关即时保存
  async function change(key: keyof Settings, value: boolean) {
    setSaving(key)
    try { setSettings(await api<Settings>('/admin/moderation/settings', { method: 'PUT', body: { [key]: value } })) }
    catch (e) { showToast({ title: t('admin.moderation.opFailed'), message: (e as Error).message, tone: 'error' }) }
    finally { setSaving(null) }
  }

  if (!settings) return <Loading className="py-16" />
  return (
    <Card className="max-w-2xl divide-y divide-slate-100">
      {SETTING_KEYS.map((key) => (
        <div key={key} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800">{t(`admin.moderation.settings.${key}`)}</div>
            <p className="mt-0.5 text-xs text-slate-400">{t(`admin.moderation.settings.${key}Hint`)}</p>
          </div>
          <Switch checked={settings[key]} disabled={saving === key} onChange={(v) => change(key, v)} ariaLabel={t(`admin.moderation.settings.${key}`)} />
        </div>
      ))}
    </Card>
  )
}
