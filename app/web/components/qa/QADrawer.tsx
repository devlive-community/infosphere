import type { User } from '@/lib/types'
import type { QACitation } from '@/lib/qa'
import QAAskPanel from '@/components/qa/QAAskPanel'
import QACommunity from '@/components/qa/QACommunity'
import { SegmentedTabs } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

export type QATab = 'ai' | 'community'

interface Props {
  user: User | null
  book: { id: number; slug: string }
  docId: number
  tab: QATab
  questionId: number | null
  selection: string
  onClearSelection: () => void
  // 由阅读页写入 URL（?qa=ai|community&qaq=问题ID）
  onNavigate: (tab: QATab | null, questionId?: number | null) => void
  onCite: (c: QACitation) => void
  loginHref: string
}

// QADrawer 阅读页右侧问答抽屉：AI 问答 / 社区问答两个 Tab；桌面端不遮挡正文，可继续划词提问。
export default function QADrawer({ user, book, docId, tab, questionId, selection, onClearSelection, onNavigate, onCite, loginHref }: Props) {
  const { t } = useTranslation()
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30 lg:hidden" onClick={() => onNavigate(null)} />
      <aside className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl" aria-label={t('qa.reader.title')}>
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
          <i className="fa-solid fa-comments text-primary-500" aria-hidden="true" />
          <span className="font-semibold text-slate-900">{t('qa.reader.title')}</span>
          <button type="button" onClick={() => onNavigate(null)} aria-label={t('qa.reader.close')}
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <SegmentedTabs fullWidth size="sm" value={tab} ariaLabel={t('qa.reader.title')} onChange={(v) => onNavigate(v as QATab)}
            items={[
              { value: 'ai', label: t('qa.reader.tabAI'), icon: <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> },
              { value: 'community', label: t('qa.reader.tabCommunity'), icon: <i className="fa-solid fa-people-group" aria-hidden="true" /> },
            ]} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {tab === 'ai' ? (
            <QAAskPanel user={user} book={book} docId={docId} selection={selection} onClearSelection={onClearSelection}
              onCite={onCite} onShared={(id) => onNavigate('community', id)} loginHref={loginHref} />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <QACommunity compact user={user} book={book} docId={docId} selection={selection} questionId={questionId}
                onOpenQuestion={(id) => onNavigate('community', id)} onCite={onCite} loginHref={loginHref} />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
