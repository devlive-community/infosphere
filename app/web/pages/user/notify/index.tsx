import { useEffect, useState } from 'react'
import Link from 'next/link'
import Seo from '@/components/Seo'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Switch, Loading, useFeedback } from '@/components/ui'

interface Prefs {
  comment: boolean
  reaction: boolean
  collaboration: boolean
  moderation: boolean
  system: boolean
}

const ITEMS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'comment', label: '评论与回复', hint: '有人评论你的章节或回复你的评论' },
  { key: 'reaction', label: '点赞与收藏', hint: '有人点赞或收藏你的书籍' },
  { key: 'collaboration', label: '协作邀请', hint: '有人邀请你协作书籍' },
  { key: 'moderation', label: '举报处理结果', hint: '你的举报被处理' },
  { key: 'system', label: '系统通知', hint: '版本升级等系统消息' },
]

export default function NotifyPrefs() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { showToast } = useFeedback()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    api<{ email_enabled: boolean; prefs: Prefs }>('/auth/notification-prefs')
      .then((d) => { setPrefs(d.prefs); setEmailEnabled(d.email_enabled) })
      .catch(() => setPrefs({ comment: true, reaction: true, collaboration: true, moderation: true, system: true }))
  }, [user])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载账户信息…" />

  async function save() {
    if (!prefs) return
    setSaving(true)
    try {
      await api('/auth/notification-prefs', { method: 'PUT', body: prefs })
      showToast({ message: '通知设置已保存', tone: 'success' })
    } catch (e) {
      showToast({ message: (e as Error).message || '保存失败', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="通知设置" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">账户设置</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">账户设置</h1>
          <p className="mt-2 text-[15px] text-slate-500">选择哪些站内通知同时给你发邮件</p>
        </div>

        <AccountSettingsLayout user={user} active="notify">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-6 pb-4">
              <h2 className="text-xl font-bold text-slate-900">邮件通知</h2>
              <p className="mt-1 text-sm text-slate-500">站内通知始终会在导航铃铛里显示；这里控制是否额外给你发邮件。</p>
            </div>
            <div className="px-6 pb-6">
              {!emailEnabled && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  管理员当前未开启邮件通知，以下开关暂不生效（开启后按此设置发送）。
                </div>
              )}
              {prefs === null ? (
                <Loading className="py-8" label="正在加载通知设置…" />
              ) : (
                <>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {ITEMS.map((it) => (
                      <div key={it.key} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800">{it.label}</div>
                          <div className="text-xs text-slate-400">{it.hint}</div>
                        </div>
                        <Switch ariaLabel={it.label} checked={prefs[it.key]} onChange={(v) => setPrefs({ ...prefs, [it.key]: v })} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Button loading={saving} onClick={save}>保存</Button>
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
