import { useEffect, useState } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Loading, useFeedback } from '@/components/ui'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
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
  { key: 'sm', label: '小' },
  { key: 'md', label: '中' },
  { key: 'lg', label: '大（默认）' },
  { key: 'xl', label: '特大' },
  { key: '2xl', label: '超大' },
] as const

const BTN_SIZES = [
  { key: 'sm', label: '小', desc: '紧凑' },
  { key: 'md', label: '中（默认）', desc: '标准' },
  { key: 'lg', label: '大', desc: '宽松' },
] as const

const FONT_SIZES = [
  { key: '14', label: '14px', desc: '紧凑' },
  { key: '15', label: '15px', desc: '默认' },
  { key: '16', label: '16px', desc: '舒适' },
] as const

const CONTENT_WIDTHS = [
  { key: 'narrow', label: '窄', desc: '960px' },
  { key: 'normal', label: '标准', desc: '1200px' },
  { key: 'wide', label: '宽', desc: '1440px' },
] as const

const NAV_HEIGHTS = [
  { key: '56', label: '低', desc: '56px' },
  { key: '64', label: '标准', desc: '64px' },
  { key: '72', label: '高', desc: '72px' },
] as const

const SIDEBAR_WIDTHS = [
  { key: '220', label: '窄', desc: '220px' },
  { key: '260', label: '标准', desc: '260px' },
  { key: '300', label: '宽', desc: '300px' },
] as const

const PAGE_BGS = [
  { key: '#F7F6F2', label: '暖白' },
  { key: '#F8FAFC', label: '冷白' },
  { key: '#FFFFFF', label: '纯白' },
  { key: '#F1F5F9', label: '浅灰' },
  { key: '#FAFAF9', label: '自然' },
] as const

const TABS = [
  { value: 'color', label: '主题色' },
  { value: 'radius', label: '圆角' },
  { value: 'control', label: '控件' },
  { value: 'font', label: '字体' },
  { value: 'layout', label: '布局' },
  { value: 'bg', label: '背景' },
]

export default function ThemeSettings() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { theme, applyTheme } = useApp()
  const { showToast } = useFeedback()

  const [activeTab, setActiveTab] = useState('color')
  const [hue, setHue] = useState(theme.primary_hue)
  const [radius, setRadius] = useState(theme.radius)
  const [btnSize, setBtnSize] = useState(theme.button_size)
  const [fontSize, setFontSize] = useState(theme.font_size)
  const [contentWidth, setContentWidth] = useState(theme.content_width)
  const [navHeight, setNavHeight] = useState(theme.nav_height)
  const [sidebarWidth, setSidebarWidth] = useState(theme.sidebar_width)
  const [pageBg, setPageBg] = useState(theme.page_bg)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setHue(theme.primary_hue)
    setRadius(theme.radius)
    setBtnSize(theme.button_size)
    setFontSize(theme.font_size)
    setContentWidth(theme.content_width)
    setNavHeight(theme.nav_height)
    setSidebarWidth(theme.sidebar_width)
    setPageBg(theme.page_bg)
  }, [theme])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载主题设置…" />

  async function save() {
    setSaving(true)
    try {
      const s = await api('/auth/theme-settings', {
        method: 'PUT',
        body: {
          primary_hue: hue, radius, button_size: btnSize, font_size: fontSize,
          content_width: contentWidth, nav_height: navHeight, sidebar_width: sidebarWidth, page_bg: pageBg,
        },
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
          <p className="mt-2 text-[15px] text-slate-500">定制界面外观，保存后全局生效。</p>
        </div>

        <AccountSettingsLayout user={user} active="theme">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Tab 栏 */}
            <div className="border-b border-slate-200 p-2">
              <SegmentedTabs
                value={activeTab}
                items={TABS}
                ariaLabel="主题设置分类"
                onChange={setActiveTab}
                fullWidth
              />
            </div>

            {/* Tab 内容 */}
            <div className="p-6">

              {/* 主题色 */}
              {activeTab === 'color' && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {HUES.map((h) => (
                    <OptionCard key={h.key} active={hue === h.key} onClick={() => setHue(h.key)}>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                        style={{ backgroundColor: h.color }}>
                        {hue === h.key && <CheckIcon className="h-5 w-5 text-white" />}
                      </span>
                      <span className={`text-xs font-medium ${hue === h.key ? 'text-primary-700' : 'text-slate-600'}`}>{h.label}</span>
                    </OptionCard>
                  ))}
                </div>
              )}

              {/* 圆角 */}
              {activeTab === 'radius' && (
                <div className="grid grid-cols-5 gap-3">
                  {RADII.map((r) => (
                    <OptionCard key={r.key} active={radius === r.key} onClick={() => setRadius(r.key)}>
                      <span className={`flex h-10 w-14 items-center justify-center border-2 ${
                        radius === r.key ? 'border-primary-500 bg-primary-100' : 'border-slate-300 bg-slate-100'
                      }`} style={{ borderRadius: r.key === 'sm' ? '0.25rem' : r.key === 'md' ? '0.375rem' : r.key === 'lg' ? '0.5rem' : r.key === 'xl' ? '0.75rem' : '1rem' }}>
                        {radius === r.key && <CheckIcon className="h-4 w-4 text-primary-600" />}
                      </span>
                      <span className={`text-xs font-medium ${radius === r.key ? 'text-primary-700' : 'text-slate-600'}`}>{r.label}</span>
                    </OptionCard>
                  ))}
                </div>
              )}

              {/* 控件 */}
              {activeTab === 'control' && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">控件大小</p>
                    <p className="mb-3 text-xs text-slate-500">影响按钮、输入框、Tab 等所有控件的高度和内边距</p>
                    <div className="grid grid-cols-3 gap-3">
                      {BTN_SIZES.map((b) => (
                        <OptionCard key={b.key} active={btnSize === b.key} onClick={() => setBtnSize(b.key)}>
                          <div className="space-y-2">
                            <span className={`inline-flex items-center justify-center border-2 px-4 font-medium ${
                              btnSize === b.key ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-300 bg-white text-slate-600'
                            }`} style={{
                              height: b.key === 'sm' ? '2rem' : b.key === 'md' ? '2.5rem' : '3rem',
                              fontSize: b.key === 'sm' ? '0.75rem' : b.key === 'md' ? '0.875rem' : '1rem',
                              borderRadius: 'var(--radius)',
                            }}>
                              按钮
                            </span>
                            <span className={`flex items-center justify-center border-2 px-4 text-slate-600 ${
                              btnSize === b.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                            }`} style={{
                              height: b.key === 'sm' ? '2rem' : b.key === 'md' ? '2.5rem' : '3rem',
                              fontSize: b.key === 'sm' ? '0.75rem' : b.key === 'md' ? '0.875rem' : '1rem',
                              borderRadius: 'var(--radius)',
                            }}>
                              输入框
                            </span>
                          </div>
                          <span className={`text-xs font-medium ${btnSize === b.key ? 'text-primary-700' : 'text-slate-600'}`}>{b.label}</span>
                          <span className="text-xs text-slate-400">{b.desc}</span>
                        </OptionCard>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 字体 */}
              {activeTab === 'font' && (
                <div className="grid grid-cols-3 gap-3">
                  {FONT_SIZES.map((f) => (
                    <OptionCard key={f.key} active={fontSize === f.key} onClick={() => setFontSize(f.key)}>
                      <span className={`text-lg font-semibold ${fontSize === f.key ? 'text-primary-600' : 'text-slate-700'}`}
                        style={{ fontSize: f.key + 'px' }}>Aa</span>
                      <span className={`text-xs font-medium ${fontSize === f.key ? 'text-primary-700' : 'text-slate-600'}`}>{f.label}</span>
                      <span className="text-xs text-slate-400">{f.desc}</span>
                    </OptionCard>
                  ))}
                </div>
              )}

              {/* 布局 */}
              {activeTab === 'layout' && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">内容区宽度</p>
                    <div className="grid grid-cols-3 gap-3">
                      {CONTENT_WIDTHS.map((w) => (
                        <OptionCard key={w.key} active={contentWidth === w.key} onClick={() => setContentWidth(w.key)}>
                          <span className={`flex h-8 w-full items-center justify-center rounded border-2 ${
                            contentWidth === w.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                          }`}>
                            <span className={`h-3 rounded-sm ${contentWidth === w.key ? 'bg-primary-500' : 'bg-slate-300'}`}
                              style={{ width: w.key === 'narrow' ? '50%' : w.key === 'normal' ? '70%' : '90%' }} />
                          </span>
                          <span className={`text-xs font-medium ${contentWidth === w.key ? 'text-primary-700' : 'text-slate-600'}`}>{w.label}</span>
                          <span className="text-xs text-slate-400">{w.desc}</span>
                        </OptionCard>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">导航栏高度</p>
                    <div className="grid grid-cols-3 gap-3">
                      {NAV_HEIGHTS.map((n) => (
                        <OptionCard key={n.key} active={navHeight === n.key} onClick={() => setNavHeight(n.key)}>
                          <span className={`flex w-full items-end justify-center rounded border-2 ${
                            navHeight === n.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                          }`} style={{ height: '3rem' }}>
                            <span className={`w-8 rounded-t-sm ${navHeight === n.key ? 'bg-primary-500' : 'bg-slate-300'}`}
                              style={{ height: n.key === '56' ? '1.5rem' : n.key === '64' ? '2rem' : '2.5rem' }} />
                          </span>
                          <span className={`text-xs font-medium ${navHeight === n.key ? 'text-primary-700' : 'text-slate-600'}`}>{n.label}</span>
                          <span className="text-xs text-slate-400">{n.desc}</span>
                        </OptionCard>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">侧边栏宽度</p>
                    <div className="grid grid-cols-3 gap-3">
                      {SIDEBAR_WIDTHS.map((s) => (
                        <OptionCard key={s.key} active={sidebarWidth === s.key} onClick={() => setSidebarWidth(s.key)}>
                          <span className={`flex h-8 w-full items-stretch justify-start rounded border-2 overflow-hidden ${
                            sidebarWidth === s.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                          }`}>
                            <span className={`${sidebarWidth === s.key ? 'bg-primary-500' : 'bg-slate-300'}`}
                              style={{ width: s.key === '220' ? '35%' : s.key === '260' ? '45%' : '55%' }} />
                            <span className="flex-1 bg-white" />
                          </span>
                          <span className={`text-xs font-medium ${sidebarWidth === s.key ? 'text-primary-700' : 'text-slate-600'}`}>{s.label}</span>
                          <span className="text-xs text-slate-400">{s.desc}</span>
                        </OptionCard>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 背景 */}
              {activeTab === 'bg' && (
                <div className="grid grid-cols-5 gap-3">
                  {PAGE_BGS.map((bg) => (
                    <OptionCard key={bg.key} active={pageBg === bg.key} onClick={() => setPageBg(bg.key)}>
                      <span className="flex h-10 w-full items-center justify-center rounded-lg border-2"
                        style={{
                          backgroundColor: bg.key,
                          borderColor: pageBg === bg.key ? 'var(--color-primary-500)' : '#e2e8f0',
                        }}>
                        {pageBg === bg.key && <CheckIcon className="h-4 w-4 text-primary-600" />}
                      </span>
                      <span className={`text-xs font-medium ${pageBg === bg.key ? 'text-primary-700' : 'text-slate-600'}`}>{bg.label}</span>
                    </OptionCard>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* 保存 */}
          <div className="mt-6 flex justify-end">
            <Button onClick={save} loading={saving}><SaveIcon className="h-4 w-4" /> 保存主题</Button>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}

function OptionCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`group flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${
        active ? 'border-primary-500 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
      }`}>
      {children}
    </button>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
    </svg>
  )
}
