import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Badge, Button, Input, Field, Loading } from '@/components/ui'
import { TrashIcon, PencilIcon, SaveIcon } from '@/components/icons'
import type { ConfigItem } from '@/lib/admin'

// 系统设置 · 系统配置：以 key-value 形式自由增删改任意配置项（仅管理员）
export default function SettingsConfig() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState<ConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  // 新增表单
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDesc, setNewDesc] = useState('')

  // 行内编辑
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ items: ConfigItem[] }>('/admin/configs')
      setItems(res.items)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    load()
  }, [isAdmin, load])

  async function upsert(key: string, value: string, description: string) {
    setBusy(key)
    setMessage('')
    try {
      await api('/admin/configs', { method: 'PUT', body: { key, value, description } })
      await load()
      return true
    } catch (e) {
      setMessage((e as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }

  async function addConfig() {
    const key = newKey.trim()
    if (!key) { setMessage('请填写配置键'); return }
    if (await upsert(key, newValue, newDesc)) {
      setNewKey(''); setNewValue(''); setNewDesc('')
      setMessage(`已保存配置 ${key}`)
    }
  }

  function startEdit(it: ConfigItem) {
    setEditKey(it.key); setEditValue(it.value); setEditDesc(it.description)
  }

  async function saveEdit() {
    if (!editKey) return
    if (await upsert(editKey, editValue, editDesc)) setEditKey(null)
  }

  async function remove(it: ConfigItem) {
    if (!confirm(`确定删除配置「${it.key}」？`)) return
    setBusy(it.key)
    setMessage('')
    try {
      await api(`/admin/configs/${encodeURIComponent(it.key)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsLayout active="config" description="以键值对形式管理所有系统配置。站点、邮件、存储、第三方登录等配置也存于此，可在此统一查看，并按需自由新增自定义配置。">
      {/* 新增配置 */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">新增配置</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="配置键" hint="字母数字与 . _ : -">
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="例如 feature.beta_banner" />
          </Field>
          <Field label="配置值">
            <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="任意字符串" />
          </Field>
          <Field label="描述（可选）">
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="用途说明" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button loading={busy === newKey.trim() && !!newKey} onClick={addConfig}>新增配置</Button>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}

      {/* 配置列表 */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                <th className="px-5 py-3">配置键</th>
                <th className="px-5 py-3">配置值</th>
                <th className="px-5 py-3">描述</th>
                <th className="px-5 py-3">更新时间</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5}><Loading className="py-10" label="正在加载系统配置…" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">暂无配置</td></tr>
              ) : items.map((it) => {
                const editing = editKey === it.key
                return (
                  <tr key={it.key} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-primary-700">{it.key}</span>
                        {it.reserved && <Badge tone="slate">系统</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {editing
                        ? <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                        : <span className="break-all font-mono text-xs text-slate-700">{it.value || <span className="text-slate-300">（空）</span>}</span>}
                    </td>
                    <td className="px-5 py-3">
                      {editing
                        ? <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                        : <span className="text-slate-500">{it.description || '—'}</span>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-400">{it.updated_at}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {editing ? (
                          <>
                            <Button size="sm" loading={busy === it.key} onClick={saveEdit}><SaveIcon className="h-4 w-4" /> 保存</Button>
                            <Button size="sm" variant="ghost" disabled={busy === it.key} onClick={() => setEditKey(null)}>取消</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => startEdit(it)}><PencilIcon className="h-4 w-4" /> 编辑</Button>
                            <Button size="sm" variant="danger" disabled={it.reserved || busy === it.key} onClick={() => remove(it)}><TrashIcon className="h-4 w-4" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SettingsLayout>
  )
}
