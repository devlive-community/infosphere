import { useEffect, useState, FormEvent } from 'react'
import { api, formatDate } from '@/lib/api'
import { useRequireAuth, useApp } from '@/lib/auth'
import { Button, Input, Textarea, Field } from '@/components/ui'

export default function Profile() {
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
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-slate-900">个人资料</h1>
      <form onSubmit={submit} className="card space-y-4 p-6">
        {message && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600">{message}</div>}
        {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
          {avatar
            ? <img src={avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
            : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-xl font-bold text-white">{user.username[0]?.toUpperCase()}</span>}
          <div>
            <div className="font-semibold text-slate-900">{user.username}</div>
            <div className="text-xs text-slate-400">角色：{user.role === 'admin' ? '管理员' : '用户'}</div>
          </div>
        </div>

        <Field label="邮箱">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="头像 URL">
          <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="个人简介">
          <Textarea className="min-h-[100px]" value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field label="GitHub 主页">
          <Input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/username" />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>保存资料</Button>
        </div>
      </form>
    </div>
  )
}
