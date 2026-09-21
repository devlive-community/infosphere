import { useEffect, useState } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Button, Input, Loading, SegmentedTabs, useFeedback } from '@/components/ui'
import { SaveIcon } from '@/components/icons'

export default function ThemeSettings() {
  const { site } = useApp()
  const siteName = site.site_name || 'KnowForge'
  const user = useRequireAuth()
  const { theme, applyTheme } = useApp()
  const { showToast } = useFeedback()
  const { t } = useTranslation()

  const HUES = [
    { key: 'blue', label: t('user.theme.hueBlue'), color: '#4169E1' },
    { key: 'indigo', label: t('user.theme.hueIndigo'), color: '#4F46E5' },
    { key: 'violet', label: t('user.theme.hueViolet'), color: '#8B5CF6' },
    { key: 'emerald', label: t('user.theme.hueEmerald'), color: '#10B981' },
    { key: 'rose', label: t('user.theme.hueRose'), color: '#F43F5E' },
    { key: 'amber', label: t('user.theme.hueAmber'), color: '#F59E0B' },
    { key: 'custom', label: t('user.theme.hueCustom'), color: '' },
  ] as const

  const RADII = [
    { key: 'sm', label: t('user.theme.radiusSm'), value: '0.25rem' },
    { key: 'md', label: t('user.theme.radiusMd'), value: '0.375rem' },
    { key: 'lg', label: t('user.theme.radiusLg'), value: '0.5rem' },
    { key: 'xl', label: t('user.theme.radiusXl'), value: '0.75rem' },
    { key: '2xl', label: t('user.theme.radius2xl'), value: '1rem' },
    { key: 'custom', label: t('user.theme.hueCustom'), value: '' },
  ] as const

  const BTN_SIZES = [
    { key: 'sm', label: t('user.theme.btnSm'), desc: t('user.theme.btnSmDesc'), height: '2rem', heightSm: '1.75rem' },
    { key: 'md', label: t('user.theme.btnMd'), desc: t('user.theme.btnMdDesc'), height: '2.5rem', heightSm: '2rem' },
    { key: 'lg', label: t('user.theme.btnLg'), desc: t('user.theme.btnLgDesc'), height: '3rem', heightSm: '2.5rem' },
    { key: 'custom', label: t('user.theme.hueCustom'), desc: '', height: '', heightSm: '' },
  ] as const

  const FONT_SIZES = [
    { key: '14', label: '14px', desc: t('user.theme.fontCompact') },
    { key: '15', label: '15px', desc: t('user.theme.fontDefault') },
    { key: '16', label: '16px', desc: t('user.theme.fontComfortable') },
    { key: 'custom', label: t('user.theme.hueCustom'), desc: '' },
  ] as const

  const CONTENT_WIDTHS = [
    { key: 'narrow', label: t('user.theme.widthNarrow'), value: '960px' },
    { key: 'normal', label: t('user.theme.widthNormal'), value: '1200px' },
    { key: 'wide', label: t('user.theme.widthWide'), value: '1440px' },
    { key: 'custom', label: t('user.theme.hueCustom'), value: '' },
  ] as const

  const NAV_HEIGHTS = [
    { key: '56', label: t('user.theme.heightLow'), value: '3.5rem' },
    { key: '64', label: t('user.theme.heightNormal'), value: '4rem' },
    { key: '72', label: t('user.theme.heightHigh'), value: '4.5rem' },
    { key: 'custom', label: t('user.theme.hueCustom'), value: '' },
  ] as const

  const SIDEBAR_WIDTHS = [
    { key: '220', label: t('user.theme.widthNarrow'), value: '220px' },
    { key: '260', label: t('user.theme.widthNormal'), value: '260px' },
    { key: '300', label: t('user.theme.widthWide'), value: '300px' },
    { key: 'custom', label: t('user.theme.hueCustom'), value: '' },
  ] as const

  const PAGE_BGS = [
    { key: '#F7F6F2', label: t('user.theme.bgWarmWhite') },
    { key: '#F8FAFC', label: t('user.theme.bgCoolWhite') },
    { key: '#FFFFFF', label: t('user.theme.bgPureWhite') },
    { key: '#F1F5F9', label: t('user.theme.bgLightGray') },
    { key: '#FAFAF9', label: t('user.theme.bgNatural') },
    { key: 'custom', label: t('user.theme.hueCustom') },
  ] as const

  const TABS = [
    { value: 'color', label: t('user.theme.tabColor') },
    { value: 'radius', label: t('user.theme.tabRadius') },
    { value: 'control', label: t('user.theme.tabControl') },
    { value: 'font', label: t('user.theme.tabFont') },
    { value: 'layout', label: t('user.theme.tabLayout') },
    { value: 'bg', label: t('user.theme.tabBg') },
  ]

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

  if (!user) return <Loading className="min-h-[60vh]" label={t('user.theme.loading')} />

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
      showToast(t('user.theme.saved'))
    } catch (err) {
      showToast({ message: (err as Error).message, tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title={t('user.theme.title')} noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">{t('user.theme.home')}</Link>
          <span className="text-slate-300">/</span>
          <Link href="/user/profile" className="hover:text-primary-600">{t('user.theme.accountSettings')}</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">{t('user.theme.title')}</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">{t('user.theme.title')}</h1>
          <p className="mt-2 text-[15px] text-slate-500">{t('user.theme.description')}</p>
        </div>

        <AccountSettingsLayout user={user} active="theme">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-2">
              <SegmentedTabs
                value={activeTab}
                items={TABS}
                ariaLabel={t('user.theme.tabLabel')}
                onChange={setActiveTab}
                fullWidth
              />
            </div>

            <div className="p-6">

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
                        <label className="text-sm font-medium text-slate-700">{t('user.theme.pickColor')}</label>
                        <input
                          type="color"
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          className="w-14 cursor-pointer rounded-lg border border-slate-200"
                          style={{ height: 'var(--control-height)' }}
                        />
                        <Input
                          value={customColor}
                          onChange={(e) => {
                            const v = e.target.value
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCustomColor(v)
                          }}
                          className="w-24 font-mono"
                          placeholder="#000000"
                        />
                      </div>
                      <span className="text-xs text-slate-500">{t('user.theme.customColorHint')}</span>
                    </div>
                  )}
                </div>
              )}

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
                        <label className="text-sm font-medium text-slate-700">{t('user.theme.radiusValue')}</label>
                        <Input
                          value={customRadius}
                          onChange={(e) => setCustomRadius(e.target.value)}
                          className="w-28 font-mono"
                          placeholder="0.5rem"
                        />
                      </div>
                      <span className="text-xs text-slate-500">{t('user.theme.cssUnitHint')}</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'control' && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">{t('user.theme.controlSize')}</p>
                    <p className="mb-3 text-xs text-slate-500">{t('user.theme.controlSizeHint')}</p>
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
                              {t('user.theme.btnExample')}
                            </span>
                            <span className={`flex items-center justify-center border-2 px-4 text-slate-600 ${
                              btnSize === b.key ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-white'
                            }`} style={{
                              height: b.height || customControlHeight || '2.5rem',
                              fontSize: '0.875rem',
                              borderRadius: 'var(--radius)',
                            }}>
                              {t('user.theme.inputExample')}
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
                          <label className="text-sm font-medium text-slate-700">{t('user.theme.height')}</label>
                          <Input
                            value={customControlHeight}
                            onChange={(e) => setCustomControlHeight(e.target.value)}
                            className="w-28 font-mono"
                            placeholder="2.5rem"
                          />
                        </div>
                        <span className="text-xs text-slate-500">{t('user.theme.cssUnitHintRemPx')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                        <label className="text-sm font-medium text-slate-700">{t('user.theme.fontSize')}</label>
                        <Input
                          value={customFontSize}
                          onChange={(e) => setCustomFontSize(e.target.value)}
                          className="w-28 font-mono"
                          placeholder="15px"
                        />
                      </div>
                      <span className="text-xs text-slate-500">{t('user.theme.cssUnitHintPxRemEm')}</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'layout' && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">{t('user.theme.contentWidth')}</p>
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
                          <label className="text-sm font-medium text-slate-700">{t('user.theme.width')}</label>
                          <Input
                            value={customContentWidth}
                            onChange={(e) => setCustomContentWidth(e.target.value)}
                            className="w-28 font-mono"
                            placeholder="1200px"
                          />
                        </div>
                        <span className="text-xs text-slate-500">{t('user.theme.cssUnitHintPxRemPercent')}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">{t('user.theme.navHeight')}</p>
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
                          <label className="text-sm font-medium text-slate-700">{t('user.theme.height')}</label>
                          <Input
                            value={customNavHeight}
                            onChange={(e) => setCustomNavHeight(e.target.value)}
                            className="w-28 font-mono"
                            placeholder="4rem"
                          />
                        </div>
                        <span className="text-xs text-slate-500">{t('user.theme.cssUnitHintRemPx')}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">{t('user.theme.sidebarWidth')}</p>
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
                          <label className="text-sm font-medium text-slate-700">{t('user.theme.width')}</label>
                          <Input
                            value={customSidebarWidth}
                            onChange={(e) => setCustomSidebarWidth(e.target.value)}
                            className="w-28 font-mono"
                            placeholder="260px"
                          />
                        </div>
                        <span className="text-xs text-slate-500">{t('user.theme.cssUnitHintRemPx')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                        <label className="text-sm font-medium text-slate-700">{t('user.theme.pickColor')}</label>
                        <input
                          type="color"
                          value={customPageBg}
                          onChange={(e) => setCustomPageBg(e.target.value)}
                          className="w-14 cursor-pointer rounded-lg border border-slate-200"
                          style={{ height: 'var(--control-height)' }}
                        />
                        <Input
                          value={customPageBg}
                          onChange={(e) => {
                            const v = e.target.value
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setCustomPageBg(v)
                          }}
                          className="w-24 font-mono"
                          placeholder="#000000"
                        />
                      </div>
                      <span className="text-xs text-slate-500">{t('user.theme.customBgHint')}</span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={save} loading={saving}><SaveIcon className="h-4 w-4" /> {t('user.theme.save')}</Button>
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
