import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import { Button, Badge, Loading, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'
import { SystemVersion } from '@/lib/admin'

// 版本更新：版本信息与在线升级（仅管理员）
export default function AdminUpgrade() {
  const { confirmAction } = useFeedback()
  const { user } = useApp()
  const { t } = useTranslation()
  const isAdmin = user?.role === 'admin'
  const [info, setInfo] = useState<SystemVersion | null>(null)
  const [message, setMessage] = useState('')
  const [upgrading, setUpgrading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<SystemVersion>('/system/version')
      .then(setInfo)
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function upgrade() {
    if (!await confirmAction({
      title: t('admin.upgrade.confirmTitle'),
      message: t('admin.upgrade.confirmMessage'),
      confirmLabel: t('admin.upgrade.upgradeNow'),
    })) return
    setUpgrading(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/system/upgrade', { method: 'POST' })
      setMessage(result.message || t('admin.upgrade.success'))
      setTimeout(() => window.location.reload(), 8000)
    } catch (e) {
      setMessage((e as Error).message)
      setUpgrading(false)
    }
  }

  return (
    <AdminLayout current="upgrade" breadcrumb={t('admin.nav.upgrade')}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.nav.upgrade')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('admin.upgrade.description')}</p>
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">{t('admin.upgrade.versionInfo')}</h2>
          {loading ? (
            <Loading className="py-8" label={t('admin.upgrade.loading')} />
          ) : info ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">{t('admin.upgrade.currentVersion')}</dt>
                <dd className="font-mono font-semibold">v{info.version}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">{t('admin.upgrade.buildCommit')}</dt>
                <dd className="font-mono text-xs">{info.commit}</dd>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">{t('admin.upgrade.latestVersion')}</dt>
                <dd>
                  {info.latest
                    ? <a href={info.latest.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary-600 hover:underline">v{info.latest.version}（{t('admin.upgrade.viewReleaseNotes')}）</a>
                    : <span className="text-slate-400">{t('admin.upgrade.fetchingUnavailable')}</span>}
                </dd>
              </div>
              <div className="flex items-center justify-between pt-1">
                <dt className="text-slate-500">{t('admin.upgrade.upgradeStatus')}</dt>
                <dd>{info.update_available ? <Badge tone="amber">{t('admin.upgrade.upgradeable')}</Badge> : <Badge tone="emerald">{t('admin.upgrade.upToDate')}</Badge>}</dd>
              </div>
            </dl>
          ) : <p className="py-6 text-sm text-slate-400">{t('admin.upgrade.unavailable')}</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 font-semibold text-slate-900">{t('admin.upgrade.onlineUpgrade')}</h2>
          <p className="mb-4 text-sm text-slate-500">
            {t('admin.upgrade.onlineDescription')}
          </p>
          {message && <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
          <Button onClick={upgrade} disabled={!info?.update_available} loading={upgrading}>
            {info?.update_available || upgrading ? t('admin.upgrade.upgradeNow') : t('admin.upgrade.noUpgrade')}
          </Button>
        </section>
      </div>
    </AdminLayout>
  )
}
