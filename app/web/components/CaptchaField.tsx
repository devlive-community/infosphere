import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Field, Input, Tooltip } from '@/components/ui'

export interface CaptchaValue {
  id: string
  answer: string
  required: boolean
}

interface CaptchaResponse {
  required: boolean
  id?: string
  type?: 'image' | 'arithmetic'
  image?: string
  question?: string
}

// CaptchaField 场景验证码：向 /captcha?scene=X 取挑战；场景未开启则不渲染。
// 通过 onChange 向父组件上报 { id, answer, required }，父组件提交时带上 captcha_id/captcha_answer。
// refreshSignal 变化时重新取一个新验证码（提交失败后调用）。
export default function CaptchaField({ scene, onChange, refreshSignal = 0 }: {
  scene: 'register' | 'login' | 'comment'
  onChange: (value: CaptchaValue) => void
  refreshSignal?: number
}) {
  const [data, setData] = useState<CaptchaResponse | null>(null)
  const [answer, setAnswer] = useState('')

  const load = useCallback(() => {
    setAnswer('')
    api<CaptchaResponse>('/captcha', { params: { scene } })
      .then((d) => {
        setData(d)
        onChange({ id: d.id || '', answer: '', required: !!d.required })
      })
      .catch(() => setData({ required: false }))
  }, [scene]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load, refreshSignal])

  if (!data || !data.required) return null

  return (
    <Field label="验证码">
      <div className="flex items-center gap-2">
        {data.type === 'image' ? (
          <img src={data.image} alt="图形验证码" className="h-11 shrink-0 rounded-lg border border-slate-200 bg-white" style={{ height: 'var(--control-height)' }} />
        ) : (
          <span className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-base font-semibold text-slate-700" style={{ height: 'var(--control-height)' }}>
            {data.question}
          </span>
        )}
        <Input
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); onChange({ id: data.id || '', answer: e.target.value, required: true }) }}
          placeholder="请输入验证码" autoComplete="off" className="flex-1" aria-label="验证码"
        />
        <Tooltip content="换一张">
          <button type="button" onClick={load} aria-label="换一张验证码"
            className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            style={{ width: 'var(--control-height)', height: 'var(--control-height)' }}>
            <i className="fa-solid fa-rotate text-sm" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </Field>
  )
}
