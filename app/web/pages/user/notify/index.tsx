import { useEffect, useState } from 'react'
import Link from 'next/link'
import Seo from '@/components/Seo'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Button, Switch, Loading, useFeedback } from '@/components/ui'

interface Prefs {
  comment: boolean
  reaction: boolean
  collaboration: boolean
  moderation: boolean
  system: boolean
  achievement: boolean
  book_update: boolean
  growth: boolean
}

const ITEMS: { key: keyof Prefs; labelKey: string; hintKey: string }[] = [
  { key: 'comment', labelKey: 'notify.itemCommentLabel', hintKey: 'notify.itemCommentHint' },
  { key: 'reaction', labelKey: 'notify.itemReactionLabel', hintKey: 'notify.itemReactionHint' },
  { key: 'collaboration', labelKey: 'notify.itemCollaborationLabel', hintKey: 'notify.itemCollaborationHint' },
  { key: 'moderation', labelKey: 'notify.itemModerationLabel', hintKey: 'notify.itemModerationHint' },
  { key: 'system', labelKey: 'notify.itemSystemLabel', hintKey: 'notify.itemSystemHint' },
  { key: 'achievement', labelKey: 'notify.itemAchievementLabel', hintKey: 'notify.itemAchievementHint' },
  { key: 'book_update', labelKey: 'notify.itemBookUpdateLabel', hintKey: 'notify.itemBookUpdateHint' },
  { key: 'growth', labelKey: 'notify.itemGrowthLabel', hintKey: 'notify.itemGrowthHint' },
]

export default function NotifyPrefs() {
  const { site } = useApp()
  const { t } = useTranslation()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { showToast } = useFeedback()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  // 插件禁用时隐藏对应的通知偏好项
  const achievementsEnabled = (site.feature_plugins || []).includes('achievements')
  const followEnabled = (site.feature_plugins || []).includes('book-follow')
  const growthEnabled = (site.feature_plugins || []).includes('growth')
  const items = ITEMS.filter((it) =>
    (it.key !== 'achievement' || achievementsEnabled) &&
    (it.key !== 'book_update' || followEnabled) &&
    (it.key !== 'growth' || growthEnabled))

  useEffect(() => {
    if (!user) return
    api<{ email_enabled: boolean; prefs: Prefs }>('/auth/notification-prefs')
      .then((d) => { setPrefs(d.prefs); setEmailEnabled(d.email_enabled) })
      .catch(() => setPrefs({ comment: true, reaction: true, collaboration: true, moderation: true, system: true, achievement: true, book_update: true, growth: true }))
  }, [user])

  if (!user) return <Loading className="min-h-[60vh]" label={t('account.common.loadingInfo')} />

  async function save() {
    if (!prefs) return
    setSaving(true)
    try {
      await api('/auth/notification-prefs', { method: 'PUT', body: prefs })
      showToast({ message: t('notify.saved'), tone: 'success' })
    } catch (e) {
      showToast({ message: (e as Error).message || t('notify.saveFailed'), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title={t('notify.seoTitle')} noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">{t('account.common.home')}</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">{t('account.common.settings')}</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">{t('account.common.settings')}</h1>
          <p className="mt-2 text-[15px] text-slate-500">{t('notify.pageSubtitle')}</p>
        </div>

        <AccountSettingsLayout user={user} active="notify">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-bold text-slate-900">{t('notify.emailHeading')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('notify.emailDesc')}</p>
            </div>
            <div className="px-6 pb-6">
              {prefs === null ? (
                <Loading className="py-8" label={t('notify.loading')} />
              ) : (
                <>
                  {!emailEnabled && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {t('notify.adminDisabled')}
                    </div>
                  )}
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {items.map((it) => (
                      <div key={it.key} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800">{t(it.labelKey)}</div>
                          <div className="text-xs text-slate-400">{t(it.hintKey)}</div>
                        </div>
                        <Switch ariaLabel={t(it.labelKey)} checked={prefs[it.key]} onChange={(v) => setPrefs({ ...prefs, [it.key]: v })} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Button loading={saving} onClick={save}>{t('notify.save')}</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
