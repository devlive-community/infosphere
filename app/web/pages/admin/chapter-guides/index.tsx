import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminLayout from '@/components/AdminLayout'
import FeatureGate from '@/components/FeatureGate'
import { api } from '@/lib/api'
import { Badge, Button, Card, Loading, Select, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface Settings { cost_bearer: 'author' | 'site'; ai_available: boolean }

export default function AdminChapterGuides() {
  return <FeatureGate feature="chapter-guide"><Inner /></FeatureGate>
}

// 章节导读插件管理：费用承担方（作者 / 站点）；每月生成次数在「权益」中配置（成长等级/会员可提升）。
function Inner() {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [data, setData] = useState<Settings | null>(null)
  const [bearer, setBearer] = useState<'author' | 'site'>('author')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<Settings>('/admin/chapter-guides/settings')
      .then((d) => { setData(d); setBearer(d.cost_bearer) })
      .catch((e) => showToast({ title: t('admin.chapterGuide.loadFailed'), message: (e as Error).message, tone: 'error' }))
  }, [showToast, t])

  async function save() {
    setSaving(true)
    try {
      const d = await api<Settings>('/admin/chapter-guides/settings', { method: 'PUT', body: { cost_bearer: bearer } })
      setData(d)
      showToast({ message: t('admin.chapterGuide.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('admin.chapterGuide.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout current="chapter-guide" breadcrumb={t('admin.nav.chapterGuide')}>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.nav.chapterGuide')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('admin.chapterGuide.description')}</p>
      </div>
      {!data ? <Loading className="mt-6" /> : (
        <div className="mt-6 max-w-2xl space-y-5">
          <Card className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <span className="text-slate-500">{t('admin.chapterGuide.aiService')}</span>
            <Badge tone={data.ai_available ? 'emerald' : 'rose'}>{t(data.ai_available ? 'admin.chapterGuide.aiReady' : 'admin.chapterGuide.aiMissing')}</Badge>
            <Link href="/admin/settings/ai" className="ml-auto font-medium text-primary-600 hover:text-primary-700">{t('admin.chapterGuide.configureAI')}</Link>
          </Card>
          <Card className="space-y-4 p-6">
            <div>
              <div className="font-medium text-slate-900">{t('admin.chapterGuide.bearer')}</div>
              <p className="mt-1 text-sm text-slate-500">{t('admin.chapterGuide.bearerHint')}</p>
              <div className="mt-3 max-w-xs">
                <Select value={bearer} onChange={(v) => setBearer(v as 'author' | 'site')}
                  options={[{ value: 'author', label: t('admin.chapterGuide.bearerAuthor') }, { value: 'site', label: t('admin.chapterGuide.bearerSite') }]} />
              </div>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              {t('admin.chapterGuide.quotaNote')} <Link href="/admin/settings/entitlements" className="font-medium text-primary-600 hover:text-primary-700">{t('admin.chapterGuide.quotaLink')}</Link>
            </p>
            <div className="flex justify-end">
              <Button loading={saving} disabled={bearer === data.cost_bearer} onClick={() => void save()}>{t('common.actions.save')}</Button>
            </div>
          </Card>
        </div>
      )}
    </AdminLayout>
  )
}
