import { useEffect, useState } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Loading, useFeedback } from '@/components/ui'
import { SaveIcon } from '@/components/icons'

const HUES = [
  { key: 'blue', label: '钴蓝', color: '#4169E1' },
  { key: 'indigo', label: '靛蓝', color: '#4F46E5' },
  { key: 'violet', label: '紫罗兰', color: '#8B5CF6' },
  { key: 'emerald', label: '翡翠', color: '#10B981' },
  { key: 'rose', label: '玫瑰', color: '#F43F5E' },
  { key: 'amber', label: '琥珀', color: '#F59E0B' },
] as const

const RADII = [
  { key: 'sm', label: '小', sample: 'rounded' },
  { key: 'md', label: '中', sample: 'rounded-md' },
  { key: 'lg', label: '大（默认）', sample: 'rounded-lg' },
  { key: 'xl', label: '特大', sample: 'rounded-xl' },
  { key: '2xl', label: '超大', sample: 'rounded-2xl' },
] as const

export default function ThemeSettings() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { theme, applyTheme } = useApp()
  const { showToast } = useFeedback()

  const [hue, setHue] = useState(theme.primary_hue)
  const [radius, setRadius] = useState(theme.radius)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setHue(theme.primary_hue)
    setRadius(theme.radius)
  }, [theme])

  // 实时预览：选择时立即应用到 DOM
  useEffect(() => {
    applyTheme({ primary_hue: hue, radius })
  }, [hue, radius, applyTheme])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载主题设置…" />

  async function save() {
    setSaving(true)
    try {
      const s = await api<{ primary_hue: string; radius: string }>('/auth/theme-settings', {
        method: 'PUT',
        body: { primary_hue: hue, radius },
      })
      applyTheme(s)
      showToast('主题已保存')
    } catch (err) {
      showToast({ message: (err as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="主题设置" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <Link href="/user/profile" className="hover:text-primary-600">账户设置</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">主题设置</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">主题设置</h1>
          <p className="mt-2 text-[15px] text-slate-500">定制界面主色调与圆角风格，修改后全局实时预览。</p>
        </div>

        <AccountSettingsLayout user={user} active="theme">
          <div className="space-y-6">
            {/* 主题色 */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-900">主题色</h2>
                <p className="mt-1 text-sm text-slate-500">选择全局主色调，影响按钮、链接、高亮等所有品牌色元素。</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {HUES.map((h) => (
                    <button key={h.key} type="button" onClick={() => setHue(h.key)}
                      className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                        hue === h.key ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                        style={{ backgroundColor: h.color }}>
                        {hue === h.key && (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-white">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      <span className={`text-xs font-medium ${hue === h.key ? 'text-primary-700' : 'text-slate-600'}`}>{h.label}</span>
                    </button>
                  ))}
                </div>
                {/* 预览 */}
                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <p className="mb-3 text-xs font-medium text-slate-500">预览效果</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-500 px-4 text-sm font-medium text-white shadow-sm">
                      主要按钮
                    </button>
                    <button type="button" className="inline-flex h-10 items-center justify-center rounded-lg border border-primary-300 bg-white px-4 text-sm font-medium text-primary-700">
                      次要按钮
                    </button>
                    <span className="text-sm font-medium text-primary-600 hover:underline">链接文字</span>
                    <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200">
                      徽标
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 圆角弧度 */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-900">圆角弧度</h2>
                <p className="mt-1 text-sm text-slate-500">调整全局组件的圆角大小。</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-5 gap-3">
                  {RADII.map((r) => (
                    <button key={r.key} type="button" onClick={() => setRadius(r.key)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                        radius === r.key ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <span className={`flex h-10 w-14 items-center justify-center border-2 ${r.sample} ${
                        radius === r.key ? 'border-primary-500 bg-primary-100' : 'border-slate-300 bg-slate-100'
                      }`}>
                        {radius === r.key && (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-primary-600">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      <span className={`text-xs font-medium ${radius === r.key ? 'text-primary-700' : 'text-slate-600'}`}>{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 保存 */}
            <div className="flex justify-end">
              <Button onClick={save} loading={saving}><SaveIcon className="h-4 w-4" /> 保存主题</Button>
            </div>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
