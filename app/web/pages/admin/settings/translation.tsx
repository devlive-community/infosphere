import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/auth'
import SettingsLayout from '@/components/SettingsLayout'
import { Button, Input, Field, Select, Loading } from '@/components/ui'

interface TranslationConfig {
  provider: string
  api_key: string
  api_base: string
  model: string
}

const emptyConfig: TranslationConfig = { provider: 'none', api_key: '', api_base: '', model: '' }

// 后台按提供方给出的默认地址/模型提示，留空则由后端使用同样的默认值
const HINTS: Record<string, { base: string; model: string }> = {
  google: { base: 'https://translation.googleapis.com', model: '（Google 翻译无需模型）' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  claude: { base: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest' },
}

// 系统设置 · 翻译服务：配置写作台翻译按钮使用的翻译方式（Google / OpenAI 协议 / Claude 协议）
export default function SettingsTranslation() {
  const { user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [cfg, setCfg] = useState<TranslationConfig>(emptyConfig)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    api<TranslationConfig>('/translation')
      .then((d) => setCfg({ provider: d.provider || 'none', api_key: d.api_key || '', api_base: d.api_base || '', model: d.model || '' }))
      .catch((e) => setMessage((e as Error).message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await api('/translation', { method: 'PUT', body: cfg })
      setMessage('翻译配置已保存，刷新后写作台生效。')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const hint = HINTS[cfg.provider]
  const isAI = cfg.provider === 'openai' || cfg.provider === 'claude'

  return (
    <SettingsLayout active="translation" description="配置写作台「翻译」按钮使用的翻译方式；AI 方式适配 OpenAI 与 Claude 协议，凭据仅管理员可见，不会出现在公开配置中。">
      {loading ? <Loading className="max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm" label="正在加载翻译配置…" /> : (
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <Field label="翻译方式">
            <Select
              options={[
                { value: 'none', label: '不启用' },
                { value: 'google', label: 'Google 翻译' },
                { value: 'openai', label: 'OpenAI 协议（含兼容端点）' },
                { value: 'claude', label: 'Claude 协议' },
              ]}
              value={cfg.provider} onChange={(v) => setCfg({ ...cfg, provider: v })} />
          </Field>
          {cfg.provider !== 'none' && (
            <>
              <Field label="API Key" hint="翻译服务的密钥；仅管理员可见。">
                <Input type="password" value={cfg.api_key} onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} placeholder="sk-… 或服务密钥" />
              </Field>
              <Field label="API 地址" hint={hint ? `留空则使用默认：${hint.base}` : '留空使用默认地址'}>
                <Input value={cfg.api_base} onChange={(e) => setCfg({ ...cfg, api_base: e.target.value })} placeholder={hint?.base} />
              </Field>
              {isAI && (
                <Field label="模型" hint={hint ? `留空则使用默认：${hint.model}` : ''}>
                  <Input value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} placeholder={hint?.model} />
                </Field>
              )}
            </>
          )}
        </div>
        {message && <div className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={save}>保存翻译配置</Button>
        </div>
      </div>
      )}
    </SettingsLayout>
  )
}
