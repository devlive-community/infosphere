import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Switch, Loading, useFeedback } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

interface LogFile { name: string; size: number; modified: string }
interface LogConfig {
  enabled: boolean
  dir: string
  level: 'debug' | 'info' | 'warn' | 'error'
  retention_days: number
  files: LogFile[]
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// 系统设置 · 运行日志：按天生成日志文件，可配置目录/等级/留存天数（仅管理员）
export default function SettingsLogs() {
  const { t } = useTranslation()
  const { showToast } = useFeedback()
  const [cfg, setCfg] = useState<LogConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<LogConfig>('/logs').then(setCfg).catch(() => setCfg(null))
  }, [])

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const d = await api<LogConfig>('/logs', { method: 'PUT', body: {
        enabled: cfg.enabled, dir: cfg.dir.trim(), level: cfg.level, retention_days: cfg.retention_days,
      } })
      setCfg(d)
      showToast({ message: t('admin.settings.logs.saved'), tone: 'success' })
    } catch (e) {
      showToast({ title: t('admin.settings.logs.saveFailed'), message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="logs" description={t('admin.settings.logs.description')}>
      {cfg === null ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label={t('admin.settings.logs.loading')} /> : (
        <div className="max-w-2xl space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">{t('admin.settings.logs.enable')}</div>
                <p className="mt-1 text-xs text-slate-500">{t('admin.settings.logs.enableHint')}</p>
              </div>
              <Switch checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} ariaLabel={t('admin.settings.logs.enable')} />
            </div>
            <div className="space-y-4">
              <Field label={t('admin.settings.logs.dir')} hint={t('admin.settings.logs.dirHint')}>
                <Input value={cfg.dir} onChange={(e) => setCfg({ ...cfg, dir: e.target.value })} placeholder="/data/logs" disabled={!cfg.enabled} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('admin.settings.logs.level')}>
                  <Select value={cfg.level} onChange={(v) => setCfg({ ...cfg, level: v as LogConfig['level'] })} options={[
                    { value: 'debug', label: 'Debug' }, { value: 'info', label: 'Info' },
                    { value: 'warn', label: 'Warn' }, { value: 'error', label: 'Error' },
                  ]} />
                </Field>
                <Field label={t('admin.settings.logs.retention')} hint={t('admin.settings.logs.retentionHint')}>
                  <Input type="number" min={1} max={3650} value={cfg.retention_days}
                    onChange={(e) => setCfg({ ...cfg, retention_days: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) })} />
                </Field>
              </div>
              <Button loading={saving} onClick={save}>{t('common.actions.save')}</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-3 font-semibold text-slate-900">{t('admin.settings.logs.files')}</div>
            {cfg.files.length === 0 ? (
              <p className="text-sm text-slate-400">{t('admin.settings.logs.noFiles')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {cfg.files.map((f) => (
                  <li key={f.name} className="flex items-center justify-between py-2">
                    <span className="font-mono text-slate-700">{f.name}</span>
                    <span className="text-xs tabular-nums text-slate-400">{formatSize(f.size)} · {f.modified}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SettingsLayout>
  )
}
