import { useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input } from '@/components/ui'
import { TrashIcon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n'
import type { FooterLinkGroup } from '@/lib/types'

function parseFooterGroups(raw?: string): FooterLinkGroup[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((g): FooterLinkGroup => ({
      title: String(g?.title || ''),
      links: Array.isArray(g?.links) ? g.links.map((l: { label?: unknown; href?: unknown }) => ({ label: String(l?.label || ''), href: String(l?.href || '') })) : [],
    }))
  } catch {
    return []
  }
}

// 系统设置 · 页脚链接：管理员按分组配置站点页脚显示的链接（仅管理员）
export default function SettingsFooter() {
  const { site } = useApp()
  const { t } = useTranslation()
  const [footerGroups, setFooterGroups] = useState<FooterLinkGroup[]>(() => parseFooterGroups(site.site_footer_links))
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  function updateGroup(gi: number, patch: Partial<FooterLinkGroup>) {
    setFooterGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  }
  function updateLink(gi: number, li: number, patch: Partial<{ label: string; href: string }>) {
    setFooterGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, links: g.links.map((l, j) => (j === li ? { ...l, ...patch } : l)) } : g)))
  }
  function addGroup() {
    setFooterGroups((prev) => [...prev, { title: '', links: [{ label: '', href: '' }] }])
  }
  function removeGroup(gi: number) {
    setFooterGroups((prev) => prev.filter((_, i) => i !== gi))
  }
  function addLink(gi: number) {
    setFooterGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, links: [...g.links, { label: '', href: '' }] } : g)))
  }
  function removeLink(gi: number, li: number) {
    setFooterGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, links: g.links.filter((_, j) => j !== li) } : g)))
  }

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      // 过滤空链接与空分组，仅提交 site_footer_links（不触碰其它站点配置）
      const cleaned = footerGroups
        .map((g) => ({ title: g.title.trim(), links: g.links.filter((l) => l.label.trim() && l.href.trim()).map((l) => ({ label: l.label.trim(), href: l.href.trim() })) }))
        .filter((g) => g.links.length > 0)
      await api('/site', { method: 'PUT', body: { site_footer_links: JSON.stringify(cleaned) } })
      setMessage(t('admin.settings.footer.saved'))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout active="footer" description={t('admin.settings.footer.description')}>
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">{t('admin.settings.site.footerLinks')}</h3>
        <p className="mb-3 text-xs text-slate-400">{t('admin.settings.site.footerLinksHint')}</p>
        <div className="space-y-4">
          {footerGroups.map((g, gi) => (
            <div key={gi} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input value={g.title} onChange={(e) => updateGroup(gi, { title: e.target.value })} placeholder={t('admin.settings.site.groupTitlePlaceholder')} className="flex-1" />
                <Button type="button" variant="ghost" className="shrink-0 text-slate-400 hover:text-rose-500" onClick={() => removeGroup(gi)} aria-label={t('admin.settings.site.deleteGroup')}>
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {g.links.map((l, li) => (
                  <div key={li} className="flex items-center gap-2">
                    <Input value={l.label} onChange={(e) => updateLink(gi, li, { label: e.target.value })} placeholder={t('admin.settings.site.linkLabel')} className="flex-1" />
                    <Input value={l.href} onChange={(e) => updateLink(gi, li, { href: e.target.value })} placeholder={t('admin.settings.site.linkUrlPlaceholder')} className="flex-[1.4]" />
                    <Button type="button" variant="ghost" className="shrink-0 text-slate-400 hover:text-rose-500" onClick={() => removeLink(gi, li)} aria-label={t('admin.settings.site.deleteLink')}>
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" className="text-slate-500" onClick={() => addLink(gi)}>+ {t('admin.settings.site.addLink')}</Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" className="text-slate-600" onClick={addGroup}>+ {t('admin.settings.site.addGroup')}</Button>
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>{t('admin.settings.footer.save')}</Button>
        </div>
      </div>
    </SettingsLayout>
  )
}
