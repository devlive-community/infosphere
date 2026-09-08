import { useEffect, useState } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Field, Select, Switch, Loading, useFeedback } from '@/components/ui'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'

interface ExportSettings {
  page_size: string
  include_cover: boolean
  include_toc: boolean
  font_size: number
  code_theme: string
  margin: string
}

const DEFAULTS: ExportSettings = { page_size: 'A4', include_cover: true, include_toc: true, font_size: 15, code_theme: 'light', margin: 'normal' }

export default function ExportSettingsPage() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { showToast } = useFeedback()
  const [s, setS] = useState<ExportSettings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    api<ExportSettings>('/auth/export-settings').then((d) => setS({ ...DEFAULTS, ...d })).catch(() => {}).finally(() => setLoaded(true))
  }, [user])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载账户信息…" />

  async function save() {
    setSaving(true)
    try {
      await api('/auth/export-settings', { method: 'PUT', body: s })
      showToast({ title: '已保存', message: '导出样式已更新', tone: 'success' })
    } catch (e) {
      showToast({ title: '保存失败', message: (e as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="账户设置" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">账户设置</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">账户设置</h1>
          <p className="mt-2 text-[15px] text-slate-500">管理你的个人信息与登录安全</p>
        </div>

        <AccountSettingsLayout user={user} active="export">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-bold text-slate-900">导出设置</h2>
              <p className="mt-1 text-sm text-slate-500">导出书籍为 PDF 时的默认样式；导出他人书籍时也可选择使用作者共享的样式。</p>
            </div>
            {!loaded ? (
              <Loading className="py-16" label="正在加载导出设置…" />
            ) : (
              <div className="space-y-5 p-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="页面尺寸">
                    <Select value={s.page_size} onChange={(v) => setS({ ...s, page_size: v })}
                      options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'Letter' }]} />
                  </Field>
                  <Field label="页边距">
                    <Select value={s.margin} onChange={(v) => setS({ ...s, margin: v })}
                      options={[{ value: 'narrow', label: '窄' }, { value: 'normal', label: '常规' }, { value: 'wide', label: '宽' }]} />
                  </Field>
                  <Field label="正文字号" hint="12–20 px">
                    <Select value={String(s.font_size)} onChange={(v) => setS({ ...s, font_size: Number(v) })}
                      options={[12, 13, 14, 15, 16, 17, 18, 20].map((n) => ({ value: String(n), label: `${n} px` }))} />
                  </Field>
                  <Field label="代码配色">
                    <Select value={s.code_theme} onChange={(v) => setS({ ...s, code_theme: v })}
                      options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <div><div className="text-sm font-medium text-slate-900">包含封面页</div><p className="mt-1 text-xs text-slate-500">在 PDF 首页展示书籍封面与标题。</p></div>
                  <Switch checked={s.include_cover} onChange={(v) => setS({ ...s, include_cover: v })} ariaLabel="包含封面页" />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <div><div className="text-sm font-medium text-slate-900">包含目录</div><p className="mt-1 text-xs text-slate-500">在正文前插入章节目录。</p></div>
                  <Switch checked={s.include_toc} onChange={(v) => setS({ ...s, include_toc: v })} ariaLabel="包含目录" />
                </div>
              </div>
            )}
            <div className="flex justify-end border-t border-slate-100 px-6 py-4">
              <Button loading={saving} onClick={save}>保存导出设置</Button>
            </div>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
