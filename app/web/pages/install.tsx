import { useState, useEffect, FormEvent } from 'react'
import { api, storeSession } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { Button, Input, Field } from '@/components/ui'
import type { DatabasePayload, SetupStatus, User } from '@/lib/types'

const dbTypes = [
  { key: 'sqlite' as const, name: 'SQLite', desc: '零配置嵌入式数据库，默认推荐。数据存储在本地文件中，适合个人与中小型部署。' },
  { key: 'mysql' as const, name: 'MySQL', desc: '广泛使用的关系型数据库，适合已有 MySQL 基础设施的团队。' },
  { key: 'postgres' as const, name: 'PostgreSQL', desc: '功能强大的开源关系型数据库，适合对标准兼容性要求高的场景。' },
]

interface InstallResponse {
  token: string
  user: User
}

export default function Install() {
  const { installed } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [done, setDone] = useState(false)

  const [dbType, setDbType] = useState<'sqlite' | 'mysql' | 'postgres'>('sqlite')
  const [db, setDb] = useState({ host: '127.0.0.1', port: '', name: 'infosphere', user: 'root', password: '', path: '' })
  const [sqliteDefaultPath, setSqliteDefaultPath] = useState('')

  useEffect(() => {
    api<SetupStatus>('/setup/status')
      .then((s) => setSqliteDefaultPath(s.sqlite_default_path || ''))
      .catch(() => {})
  }, [])
  const [site, setSite] = useState({ name: '', description: '' })
  const [admin, setAdmin] = useState({ username: '', email: '', password: '', confirm: '' })

  if (installed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-bold">系统已安装</h1>
          <p className="mt-2 text-sm text-slate-500">如需重新安装，请停止服务并删除数据目录下的 config.json。</p>
        </div>
      </div>
    )
  }

  const dbPayload = (): DatabasePayload => {
    const payload: DatabasePayload = { type: dbType }
    if (dbType === 'sqlite') {
      payload.path = db.path.trim() || undefined
    } else {
      payload.host = db.host
      payload.port = db.port ? Number(db.port) : undefined
      payload.name = db.name
      payload.user = db.user
      payload.password = db.password
    }
    return payload
  }

  async function testConnection() {
    setError('')
    setTesting(true)
    try {
      await api('/setup/test-connection', { method: 'POST', body: dbPayload() })
      alert('数据库连接成功')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  async function submitInstall(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!site.name.trim()) return setError('请填写站点名称')
    if (!admin.username.trim()) return setError('请填写管理员用户名')
    if (admin.password.length < 6) return setError('管理员密码至少 6 位')
    if (admin.password !== admin.confirm) return setError('两次输入的密码不一致')

    setInstalling(true)
    try {
      const data = await api<InstallResponse>('/setup/install', {
        method: 'POST',
        body: {
          database: dbPayload(),
          site: { name: site.name.trim(), description: site.description.trim() },
          admin: { username: admin.username.trim(), email: admin.email.trim(), password: admin.password },
        },
      })
      storeSession(data.token, data.user)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
          <h1 className="text-xl font-bold text-slate-900">安装完成！</h1>
          <p className="mt-2 text-sm text-slate-500">站点「{site.name}」已就绪，管理员 <b>{admin.username}</b> 已自动登录。</p>
          {/* 刻意整页刷新，让 AppProvider 重新读取本地会话 */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <Button type="button" className="mt-6 w-full" onClick={() => { window.location.href = '/' }}>进入首页</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-50 to-slate-50 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">欢迎使用 InfoSphere</h1>
          <p className="mt-1 text-sm text-slate-500">安装向导将帮助你完成数据库与站点初始化（{step}/2）</p>
        </div>

        {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>}

        <div className="card p-6">
          {step === 1 && (
            <div>
              <h2 className="mb-4 font-semibold text-slate-900">选择数据库</h2>
              <div className="space-y-3">
                {dbTypes.map((t) => (
                  <label key={t.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${dbType === t.key ? 'border-primary-500 bg-primary-50/50 ring-1 ring-primary-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="dbtype" checked={dbType === t.key} onChange={() => setDbType(t.key)} className="mt-1" />
                    <span>
                      <span className="block font-medium text-slate-900">{t.name}{t.key === 'sqlite' && <span className="badge ml-2 bg-primary-50 text-primary-600">默认</span>}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{t.desc}</span>
                    </span>
                  </label>
                ))}
              </div>

              {dbType === 'sqlite' ? (
                <div className="mt-4">
                  <label className="label">数据库文件路径（可选）</label>
                  <Input value={db.path} onChange={(e) => setDb({ ...db, path: e.target.value })}
                    placeholder={sqliteDefaultPath || 'data/infosphere.db'} />
                  <p className="mt-1.5 text-xs text-slate-400">
                    留空使用服务器数据目录下的默认位置{sqliteDefaultPath ? `：${sqliteDefaultPath}` : ''}。
                    相对路径将基于数据目录解析；自定义路径需保证服务运行账户可写。
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">主机</label>
                    <Input value={db.host} onChange={(e) => setDb({ ...db, host: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">端口（可选，{dbType === 'mysql' ? '3306' : '5432'}）</label>
                    <Input value={db.port} onChange={(e) => setDb({ ...db, port: e.target.value })} placeholder={dbType === 'mysql' ? '3306' : '5432'} />
                  </div>
                  <div>
                    <label className="label">数据库名</label>
                    <Input value={db.name} onChange={(e) => setDb({ ...db, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">用户名</label>
                    <Input value={db.user} onChange={(e) => setDb({ ...db, user: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className="label">密码</label>
                    <Input type="password" value={db.password} onChange={(e) => setDb({ ...db, password: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <Button type="button" variant="outline" disabled={testing} onClick={testConnection}>测试连接</Button>
                <Button type="button" onClick={() => { setError(''); setStep(2) }}>下一步</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={submitInstall}>
              <h2 className="mb-4 font-semibold text-slate-900">站点信息与管理员账户</h2>
              <div className="space-y-3">
                <div>
                  <label className="label">站点名称 *</label>
                  <Input value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} placeholder="我的知识库" />
                </div>
                <div>
                  <label className="label">站点描述</label>
                  <Input value={site.description} onChange={(e) => setSite({ ...site, description: e.target.value })} placeholder="简单介绍你的知识库" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">管理员用户名 *</label>
                    <Input value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">管理员邮箱</label>
                    <Input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">管理员密码 *</label>
                    <Input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">确认密码 *</label>
                    <Input type="password" value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>上一步</Button>
                <Button type="submit" loading={installing}>开始安装</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
