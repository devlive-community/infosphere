import { useEffect, useState, FormEvent } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Input, Field, Loading } from '@/components/ui'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'

type DeletionStatus = {
  requested: boolean
  cooldown_days: number
  deletion_requested_at?: string | null
  scheduled_delete_at?: string | null
}

// 账户设置 · 危险区：自助注销账号（含冷静期），独立左侧导航页
export default function DangerZone() {
  const { site, logout } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()

  const [deletion, setDeletion] = useState<DeletionStatus | null>(null)
  const [delOpen, setDelOpen] = useState(false)
  const [delPassword, setDelPassword] = useState('')
  const [delError, setDelError] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    api<DeletionStatus>('/auth/account/deletion').then(setDeletion).catch(() => {})
  }, [user])

  if (!user) return <Loading className="min-h-[60vh]" label="正在加载账户信息…" />

  async function requestDeletion(e: FormEvent) {
    e.preventDefault()
    setDelError('')
    setDelBusy(true)
    try {
      const res = await api<DeletionStatus & { deleted?: boolean }>('/auth/account/deletion', {
        method: 'POST',
        body: { password: delPassword },
      })
      if (res.deleted) {
        // 冷静期为 0：账号已即时删除，直接登出。
        logout()
        return
      }
      setDeletion(res)
      setDelOpen(false)
      setDelPassword('')
    } catch (err) {
      setDelError((err as Error).message)
    } finally {
      setDelBusy(false)
    }
  }

  async function cancelDeletion() {
    setDelError('')
    setDelBusy(true)
    try {
      const res = await api<DeletionStatus>('/auth/account/deletion', { method: 'DELETE' })
      setDeletion(res)
    } catch (err) {
      setDelError((err as Error).message)
    } finally {
      setDelBusy(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="危险区" noindex />
      <Container>
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <Link href="/user/profile" className="hover:text-primary-600">账户设置</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">危险区</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">危险区</h1>
          <p className="mt-2 text-[15px] text-slate-500">此处的操作不可恢复，请谨慎处理。</p>
        </div>

        <AccountSettingsLayout user={user} active="danger">
          <div className="rounded-2xl border border-rose-200 bg-white shadow-sm">
            <div className="border-b border-rose-100 p-6">
              <h2 className="text-xl font-bold text-rose-700">注销账号</h2>
              <p className="mt-1 text-sm text-slate-500">注销账号将永久删除你的账户及全部数据，包括你创建的书籍、章节与互动记录，操作不可恢复。</p>
            </div>
            <div className="p-6">
              {delError && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{delError}</div>}

              {deletion?.requested ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-amber-800">
                      <b>账号注销已安排。</b>
                      {deletion.scheduled_delete_at && (
                        <> 你的账号将于 <b>{formatDate(deletion.scheduled_delete_at).slice(0, 10)}</b> 前后被永久删除。</>
                      )}
                      <div className="mt-1 text-amber-700">在此之前你可以随时撤销。</div>
                    </div>
                    <Button variant="outline" type="button" loading={delBusy} onClick={cancelDeletion}>撤销注销</Button>
                  </div>
                </div>
              ) : !delOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-slate-500">
                    {deletion && deletion.cooldown_days > 0
                      ? `确认后将进入 ${deletion.cooldown_days} 天冷静期，到期自动删除；冷静期内可随时撤销。`
                      : '确认后账号及全部数据将被立即删除。'}
                  </span>
                  <Button variant="danger" type="button" onClick={() => { setDelError(''); setDelOpen(true) }}>注销账号</Button>
                </div>
              ) : (
                <form onSubmit={requestDeletion} className="space-y-4">
                  <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-700">
                    请再次确认：此操作将删除你的账户及全部数据。
                    {deletion && deletion.cooldown_days > 0
                      ? ` 提交后进入 ${deletion.cooldown_days} 天冷静期，到期自动删除。`
                      : ' 提交后立即删除，无法恢复。'}
                  </div>
                  <Field label="当前密码" hint="为确认是本人操作，请输入登录密码。">
                    <Input type="password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} placeholder="请输入当前密码" autoComplete="current-password" />
                  </Field>
                  <div className="flex items-center justify-end gap-3">
                    <Button variant="outline" type="button" onClick={() => { setDelOpen(false); setDelPassword(''); setDelError('') }}>取消</Button>
                    <Button variant="danger" type="submit" loading={delBusy}>确认注销</Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
