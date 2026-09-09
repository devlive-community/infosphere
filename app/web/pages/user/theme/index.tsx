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
  { key: 'custom', label: '自定义', color: '' },
] as const

const RADII = [
  { key: 'sm', label: '小', value: '0.25rem' },
  { key: 'md', label: '中', value: '0.375rem' },
  { key: 'lg', label: '大', value: '0.5rem' },
  { key: 'xl', label: '特大', value: '0.75rem' },
  { key: '2xl', label: '超大', value: '1rem' },
  { key: 'custom', label: '自定义', value: '' },
] as const

const BTN_SIZES = [
  { key: 'sm', label: '小', desc: '紧凑', height: '2rem', heightSm: '1.75rem' },
  { key: 'md', label: '中', desc: '标准', height: '2.5rem', heightSm: '2rem' },
  { key: 'lg', label: '大', desc: '宽松', height: '3rem', heightSm: '2.5rem' },
  { key: 'custom', label: '自定义', desc: '', height: '', heightSm: '' },
] as const

const FONT_SIZES = [
  { key: '14', label: '14px', desc: '紧凑' },
  { key: '15', label: '15px', desc: '默认' },
  { key: '16', label: '16px', desc: '舒适' },
  { key: 'custom', label: '自定义', desc: '' },
] as const

const CONTENT_WIDTHS = [
  { key: 'narrow', label: '窄', value: '960px' },
  { key: 'normal', label: '标准', value: '1200px' },
  { key: 'wide', label: '宽', value: '1440px' },
  { key: 'custom', label: '自定义', value: '' },
] as const

const NAV_HEIGHTS = [
  { key: '56', label: '低', value: '3.5rem' },
  { key: '64', label: '标准', value: '4rem' },
  { key: '72', label: '高', value: '4.5rem' },
  { key: 'custom', label: '自定义', value: '' },
] as const

const SIDEBAR_WIDTHS = [
  { key: '220', label: '窄', value: '220px' },
  { key: '260', label: '标准', value: '260px' },
  { key: '300', label: '宽', value: '300px' },
  { key: 'custom', label: '自定义', value: '' },
] as const

const PAGE_BGS = [
  { key: '#F7F6F2', label: '暖白' },
  { key: '#F8FAFC', label: '冷白' },
  { key: '#FFFFFF', label: '纯白' },
  { key: '#F1F5F9', label: '浅灰' },
  { key: '#FAFAF9', label: '自然' },
  { key: 'custom', label: '自定义' },
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
  const [customColor, setCustomColor] = useState(theme.custom_color || '#4169E1')
  const [radius, setRadius] = useState(theme.radius)
  const [customRadius, setCustomRadius] = useState(theme.custom_radius || '0.5rem')
  const [btnSize, setBtnSize] = useState(theme.button_size)
  const [customControlHeight, setCustomControlHeight] = useState(theme.custom_control_height || '2.5rem')
  const [fontSize, setFontSize] = useState(theme.font_size)
  const [customFontSize, setCustomFontSize] = useState(theme.custom_font_size || '15px')
  const [contentWidth, setContentWidth] = useState(theme.content_width)
  const [customContentWidth, setCustomContentWidth] = useState(theme.custom_content_width || '1200px')
  const [navHeight, setNavHeight] = useState(theme.nav_height)
  const [customNavHeight, setCustomNavHeight] = useState(theme.custom_nav_height || '4rem')
  const [sidebarWidth, setSidebarWidth] = useState(theme.sidebar_width)
  const [customSidebarWidth, setCustomSidebarWidth] = useState(theme.custom_sidebar_width || '260px')
  const [pageBg, setPageBg] = useState(theme.page_bg)
  const [customPageBg, setCustomPageBg] = useState(theme.custom_page_bg || '#F7F6F2')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setHue(theme.primary_hue)
    setCustomColor(theme.custom_color || '#4169E1')
    setRadius(theme.radius)
    setCustomRadius(theme.custom_radius || '0.5rem')
    setBtnSize(theme.button_size)
    setCustomControlHeight(theme.custom_control_height || '2.5rem')
    setFontSize(theme.font_size)
    setCustomFontSize(theme.custom_font_size || '15px')
    setContentWidth(theme.content_width)
    setCustomContentWidth(theme.custom_content_width || '1200px')
    setNavHeight(theme.nav_height)
    setCustomNavHeight(theme.custom_nav_height || '4rem')
    setSidebarWidth(theme.sidebar_width)
    setCustomSidebarWidth(theme.custom_sidebar_width || '260px')
    setPageBg(theme.page_bg)
    setCustomPageBg(theme.custom_page_bg || '#F7F6F2')
  }, [theme])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载主题设置…" />

  async function save() {
    setSaving(true)
    try {
      const s = await api('/auth/theme-settings', {
        method: 'PUT',
        body: {
          primary_hue: hue,
          custom_color: hue === 'custom' ? customColor : '',
          radius,
          custom_radius: radius === 'custom' ? customRadius : '',
          button_size: btnSize,
          custom_control_height: btnSize === 'custom' ? customControlHeight : '',
          font_size: fontSize,
          custom_font_size: fontSize === 'custom' ? customFontSize : '',
          content_width: contentWidth,
          custom_content_width: contentWidth === 'custom' ? customContentWidth : '',
          nav_height: navHeight,
          custom_nav_height: navHeight === 'custom' ? customNavHeight : '',
          sidebar_width: sidebarWidth,
          custom_sidebar_width: sidebarWidth === 'custom' ? customSidebarWidth : '',
          page_bg: pageBg,
          custom_page_bg: pageBg === 'custom' ? customPageBg : '',
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
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {HUES.map((h) => (
                      <OptionCard key={h.key} active={hue === h.key} onClick={() => setHue(h.key)}>
                        {h.key === 'custom' ? (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white transition-transform group-hover:scale-110">
                            <span className="text-lg text-slate-400">+</span>
                          </span>
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                            style={{ backgroundColor: h.color }}>
                            {hue === h.key && <CheckIcon className="h-5 w-5 text-white" />}
                          </span>
                        )}
                        <span className={`text-xs font-medium ${hue === h.key ? 'text-primary-700' : 'text-slate-600'}`}>{h.label}</span>
                      </OptionCard>
                    ))}
                  </div>

                  {hue === 'custom' && (
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-700">选择颜色</label>
                        <input
                          type="color"
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200"
                        />
                        <input
                          type="text"
                          value={customColor}
                          onChange={(e) => {
                            const v = e.target.value
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCustomColor(v)
                          }}
                          className="h-10 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                          placeholder="#000000"
                        />
                      </div>
                      <span className="text-xs text-slate-500">自定义品牌色，影响按钮、链接、高亮等</span>
                    </div>
                  )}
                </div>
              )}

              {/* 圆角 */}
              {activeTab === 'radius' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {RADII.map((r) => (
                      <OptionCard key={r.key} active={radius === r.key} onClick={() => setRadius(r.key)}>
                        <span className={`flex h-10 w-14 items-center justify-center border-2 ${
                          radius === r.key ? 'border-primary-500 bg-primary-100' : 'border-slate-300 bg-slate-100'
                        }`} style={{ borderRadius: r.value || customRadius || '0.5rem' }}>
                          {radius === r.key && <CheckIcon className="h-4 w-4 text-primary-600" />}
                        </span>
                        <span className={`text-xs font-medium ${radius === r.key ? 'text-primary-700' : 'text-slate-600'}`}>{r.label}</span>
                      </OptionCard>
                    ))}
                  </div>

                  {radius === 'custom' && (
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-700">圆角值</label>
                        <input
                          type="text"
                          value={customRadius}
                          onChange={(e) => setCustomRadius(e.target.value)}
                          className="h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                          placeholder="0.5rem"
                        />
                      </div>
                      <span className="text-xs text-slate-500">支持 rem、px、% 等 CSS 单位</span>
                    </div>
                  )}
                </div>
              )}

              {/* 控件 */}
              {activeTab === 'control' && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">控件大小</p>
                    <p className="mb-3 text-xs text-slate-500">影响按钮、输入框、Tab 等所有控件的高度和内边距</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {BTN_SIZES.map((b) => (
                        <OptionCard key={b.key} active={btnSize === b.key} onClick={() => setBtnSize(b.key)}>
                          <div className="space-y-2">
                            <span className={`inline-flex items-center justify-center border-2 px-4 font-medium ${
                              btnSize === b.key ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-300 bg-white text-slate-600'
                            }`} style={{
                              height: b.height || customControlHeight || '2.5rem',
                              fontSize: '0.875rem',
                              borderRadius: 'var(--radius)',
                            }}>
                              按钮
                            </span>
                            <span className={`flex items-center justify-center border-2 px-4 text-slate-600 ${
                              btnSize === b.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                            }`} style={{
                              height: b.height || customControlHeight || '2.5rem',
                              fontSize: '0.875rem',
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

                    {btnSize === 'custom' && (
                      <div className="mt-4 flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium text-slate-700">高度</label>
                          <input
                            type="text"
                            value={customControlHeight}
                            onChange={(e) => setCustomControlHeight(e.target.value)}
                            className="h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                            placeholder="2.5rem"
                          />
                        </div>
                        <span className="text-xs text-slate-500">支持 rem、px 等 CSS 单位</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 字体 */}
              {activeTab === 'font' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {FONT_SIZES.map((f) => (
                      <OptionCard key={f.key} active={fontSize === f.key} onClick={() => setFontSize(f.key)}>
                        <span className={`text-lg font-semibold ${fontSize === f.key ? 'text-primary-600' : 'text-slate-700'}`}
                          style={{ fontSize: f.key === 'custom' ? customFontSize : f.key + 'px' }}>Aa</span>
                        <span className={`text-xs font-medium ${fontSize === f.key ? 'text-primary-700' : 'text-slate-600'}`}>{f.label}</span>
                        <span className="text-xs text-slate-400">{f.desc}</span>
                      </OptionCard>
                    ))}
                  </div>

                  {fontSize === 'custom' && (
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-700">字号</label>
                        <input
                          type="text"
                          value={customFontSize}
                          onChange={(e) => setCustomFontSize(e.target.value)}
                          className="h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                          placeholder="15px"
                        />
                      </div>
                      <span className="text-xs text-slate-500">支持 px、rem、em 等 CSS 单位</span>
                    </div>
                  )}
                </div>
              )}

              {/* 布局 */}
              {activeTab === 'layout' && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">内容区宽度</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {CONTENT_WIDTHS.map((w) => (
                        <OptionCard key={w.key} active={contentWidth === w.key} onClick={() => setContentWidth(w.key)}>
                          <span className={`flex h-8 w-full items-center justify-center rounded border-2 ${
                            contentWidth === w.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                          }`}>
                            <span className={`h-3 rounded-sm ${contentWidth === w.key ? 'bg-primary-500' : 'bg-slate-300'}`}
                              style={{ width: w.value ? undefined : customContentWidth ? '70%' : '70%' }} />
                          </span>
                          <span className={`text-xs font-medium ${contentWidth === w.key ? 'text-primary-700' : 'text-slate-600'}`}>{w.label}</span>
                          <span className="text-xs text-slate-400">{w.value || ''}</span>
                        </OptionCard>
                      ))}
                    </div>
                    {contentWidth === 'custom' && (
                      <div className="mt-3 flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium text-slate-700">宽度</label>
                          <input
                            type="text"
                            value={customContentWidth}
                            onChange={(e) => setCustomContentWidth(e.target.value)}
                            className="h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                            placeholder="1200px"
                          />
                        </div>
                        <span className="text-xs text-slate-500">支持 px、rem、% 等 CSS 单位</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">导航栏高度</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {NAV_HEIGHTS.map((n) => (
                        <OptionCard key={n.key} active={navHeight === n.key} onClick={() => setNavHeight(n.key)}>
                          <span className={`flex w-full items-end justify-center rounded border-2 ${
                            navHeight === n.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                          }`} style={{ height: '3rem' }}>
                            <span className={`w-8 rounded-t-sm ${navHeight === n.key ? 'bg-primary-500' : 'bg-slate-300'}`}
                              style={{ height: n.value ? undefined : customNavHeight ? '2rem' : '2rem' }} />
                          </span>
                          <span className={`text-xs font-medium ${navHeight === n.key ? 'text-primary-700' : 'text-slate-600'}`}>{n.label}</span>
                          <span className="text-xs text-slate-400">{n.value || ''}</span>
                        </OptionCard>
                      ))}
                    </div>
                    {navHeight === 'custom' && (
                      <div className="mt-3 flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium text-slate-700">高度</label>
                          <input
                            type="text"
                            value={customNavHeight}
                            onChange={(e) => setCustomNavHeight(e.target.value)}
                            className="h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                            placeholder="4rem"
                          />
                        </div>
                        <span className="text-xs text-slate-500">支持 rem、px 等 CSS 单位</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">侧边栏宽度</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {SIDEBAR_WIDTHS.map((s) => (
                        <OptionCard key={s.key} active={sidebarWidth === s.key} onClick={() => setSidebarWidth(s.key)}>
                          <span className={`flex h-8 w-full items-stretch justify-start rounded border-2 overflow-hidden ${
                            sidebarWidth === s.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                          }`}>
                            <span className={`${sidebarWidth === s.key ? 'bg-primary-500' : 'bg-slate-300'}`}
                              style={{ width: s.value ? undefined : customSidebarWidth ? '45%' : '45%' }} />
                            <span className="flex-1 bg-white" />
                          </span>
                          <span className={`text-xs font-medium ${sidebarWidth === s.key ? 'text-primary-700' : 'text-slate-600'}`}>{s.label}</span>
                          <span className="text-xs text-slate-400">{s.value || ''}</span>
                        </OptionCard>
                      ))}
                    </div>
                    {sidebarWidth === 'custom' && (
                      <div className="mt-3 flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium text-slate-700">宽度</label>
                          <input
                            type="text"
                            value={customSidebarWidth}
                            onChange={(e) => setCustomSidebarWidth(e.target.value)}
                            className="h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                            placeholder="260px"
                          />
                        </div>
                        <span className="text-xs text-slate-500">支持 px、rem 等 CSS 单位</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 背景 */}
              {activeTab === 'bg' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {PAGE_BGS.map((bg) => (
                      <OptionCard key={bg.key} active={pageBg === bg.key} onClick={() => setPageBg(bg.key)}>
                        {bg.key === 'custom' ? (
                          <span className="flex h-10 w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white">
                            <span className="text-lg text-slate-400">+</span>
                          </span>
                        ) : (
                          <span className="flex h-10 w-full items-center justify-center rounded-lg border-2"
                            style={{
                              backgroundColor: bg.key,
                              borderColor: pageBg === bg.key ? 'var(--color-primary-500)' : '#e2e8f0',
                            }}>
                            {pageBg === bg.key && <CheckIcon className="h-4 w-4 text-primary-600" />}
                          </span>
                        )}
                        <span className={`text-xs font-medium ${pageBg === bg.key ? 'text-primary-700' : 'text-slate-600'}`}>{bg.label}</span>
                      </OptionCard>
                    ))}
                  </div>

                  {pageBg === 'custom' && (
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-700">选择颜色</label>
                        <input
                          type="color"
                          value={customPageBg}
                          onChange={(e) => setCustomPageBg(e.target.value)}
                          className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200"
                        />
                        <input
                          type="text"
                          value={customPageBg}
                          onChange={(e) => {
                            const v = e.target.value
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCustomPageBg(v)
                          }}
                          className="h-10 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono text-slate-900 focus:border-primary-500 focus:outline-none"
                          placeholder="#000000"
                        />
                      </div>
                      <span className="text-xs text-slate-500">自定义页面背景颜色</span>
                    </div>
                  )}
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
