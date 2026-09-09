import Link from 'next/link'
import { ButtonLink } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
      <h1 className="text-6xl font-bold text-slate-300">404</h1>
      <p className="mt-4 text-slate-500">页面不存在或已被移除</p>
      <ButtonLink href="/">
        返回首页
      </ButtonLink>
    </div>
  )
}
