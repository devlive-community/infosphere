import { useEffect, useState, FormEvent, Fragment } from 'react'
import Seo from '@/components/Seo'
import Link from 'next/link'
import Container from '@/components/Container'
import AccountSettingsLayout from '@/components/AccountSettingsLayout'
import { api } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Input, Textarea, Field } from '@/components/ui'
import { EyeIcon } from '@/components/icons'
import UserAvatar from '@/components/UserAvatar'

const MAX_BIO = 200

export default function Profile() {
  const { site } = useApp()
  const siteName = site.site_name || 'InfoSphere'
  const user = useRequireAuth()
  const { refreshUser } = useApp()
  const [email, setEmail] = useState('')
  const [avatar, setAvatar] = useState('')
  const [bio, setBio] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setEmail(user.email || '')
      setAvatar(user.avatar || '')
      setBio(user.bio || '')
      setGithubUrl(user.github_url || '')
    }
  }, [user])

  if (!user) return null

  const avatarSrc = avatar ? (/^https?:\/\//.test(avatar) ? avatar : `/uploads/${avatar.replace(/^\//, '')}`) : ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)
    try {
      await api('/auth/profile', {
        method: 'PUT',
        body: { email, avatar, bio, github_url: githubUrl },
      })
      await refreshUser()
      setMessage('资料已更新')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo siteName={siteName} title="账户设置" noindex />
      <Container>
        {/* 页头 */}
        <nav className="flex items-center gap-1.5 py-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-primary-600">首页</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900">账户设置</span>
        </nav>
        <div className="pb-6">
          <h1 className="text-3xl font-bold text-ink">账户设置</h1>
          <p className="mt-2 text-[15px] text-slate-500">管理你的个人信息与登录安全</p>
        </div>

        <AccountSettingsLayout user={user} active="profile" onAvatarChange={setAvatar}>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-bold text-slate-900">个人资料</h2>
              <p className="mt-1 text-sm text-slate-500">管理你的公开资料与账户联系方式。</p>
            </div>

            <form onSubmit={submit}>
              <div className="space-y-6 p-6">
                {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
                {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

                {/* 头像 */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
                  <label className="pt-1 text-sm font-medium text-slate-700">头像</label>
                  <div className="flex items-start gap-4">
                    <UserAvatar user={{ username: user.username, avatar }} size="h-20 w-20 text-2xl" link={false} />
                    <div>
                      <p className="text-xs text-slate-400">支持 JPG、PNG，建议使用正方形图片；也可在下方粘贴图片地址</p>
                    </div>
                  </div>
                </div>

                {/* 头像地址 */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
                  <label className="pt-2.5 text-sm font-medium text-slate-700">头像地址</label>
                  <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://images.example.com/avatar.jpg" />
                </div>

                {/* 基本信息 */}
                <div className="border-t border-slate-100 pt-6">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">基本信息</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="用户名" hint="用户名暂不支持修改">
                      <Input value={user.username} disabled />
                    </Field>
                    <Field label="电子邮箱">
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </Field>
                  </div>
                </div>

                {/* 公开资料 */}
                <div className="border-t border-slate-100 pt-6">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">公开资料</h3>
                  <div className="space-y-4">
                    <Field label="个人简介">
                      <div className="relative">
                        <Textarea maxLength={MAX_BIO} value={bio} onChange={(e) => setBio(e.target.value)}
                          placeholder="介绍一下自己，让读者认识你" className="pb-6" />
                        <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-slate-400">{bio.length} / {MAX_BIO}</span>
                      </div>
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
                      <label className="pt-2.5 text-sm font-medium text-slate-700">GitHub</label>
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 transition-colors focus-within:border-primary-500">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-700">
                          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
                        </svg>
                        <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/username"
                          className="h-10 flex-1 border-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 公开主页预览 */}
                <div className="flex items-center gap-4 rounded-xl bg-emerald-50/70 px-5 py-4 ring-1 ring-inset ring-emerald-100">
                  <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <EyeIcon className="h-4 w-4" /> 公开主页预览
                  </span>
                  <UserAvatar user={{ username: user.username, avatar }} size="h-11 w-11" link={false} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{user.username}</div>
                    <div className="truncate text-xs text-slate-500">{bio || '简介会显示在这里'}</div>
                  </div>
                </div>
              </div>

              {/* 底部操作 */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
                <Button variant="outline" type="button" onClick={() => { setEmail(user.email || ''); setAvatar(user.avatar || ''); setBio(user.bio || ''); setGithubUrl(user.github_url || '') }}>取消</Button>
                <Button type="submit" loading={saving}>✓ 保存资料</Button>
              </div>
            </form>
          </div>
        </AccountSettingsLayout>
      </Container>
    </>
  )
}
