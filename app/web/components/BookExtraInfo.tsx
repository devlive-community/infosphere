import { useTranslation } from '@/lib/i18n'
import { Tooltip } from '@/components/ui'
import type { BookInfoItem } from '@/lib/types'
import { bookInfoDisplay, bookInfoHref, bookInfoLabel, bookInfoType } from '@/lib/book-info'

// BookExtraInfo 书籍详情页「更多信息」卡片：作者在书籍设置中添加的附加属性（链接可点击，外链新窗口打开）。
export default function BookExtraInfo({ items }: { items?: BookInfoItem[] | null }) {
  const { t } = useTranslation()
  if (!items || items.length === 0) return null
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-bold text-slate-900">{t('bookInfo.heading')}</h2>
      <dl className="space-y-3 text-sm">
        {items.map((item, i) => {
          const href = bookInfoHref(item)
          const text = bookInfoDisplay(item)
          return (
            <div key={i} className="flex min-w-0 items-start gap-2.5">
              <i className={`${bookInfoType(item.type).icon} mt-0.5 w-4 shrink-0 text-center text-slate-400`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <dt className="text-xs text-slate-400">{bookInfoLabel(t, item)}</dt>
                <dd className="mt-0.5 min-w-0 text-slate-700 [overflow-wrap:anywhere]">
                  {href
                    ? <Tooltip content={item.value}><a href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer nofollow" className="text-primary-600 hover:underline">{text}</a></Tooltip>
                    : text}
                </dd>
              </div>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
