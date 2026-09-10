import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Container from '@/components/Container'
import Seo from '@/components/Seo'
import { api, formatDate } from '@/lib/api'
import { useApp, useRequireAuth } from '@/lib/auth'
import { Badge, Button, Card, EmptyState, Loading, Pagination, SegmentedTabs, useFeedback } from '@/components/ui'
import type { ReadingAnnotation } from '@/lib/reading-annotations'

type Filter = 'all' | 'note' | 'highlight' | 'bookmark'

interface MyAnnotation extends ReadingAnnotation {
  book_title: string
  book_slug: string
  document_title: string
  document_slug: string
}

interface AnnotationPage {
  items: MyAnnotation[]
  total: number
  page: number
  page_size: number
}

const filters = [
  { value: 'all', label: '全部' },
  { value: 'note', label: '私人笔记', icon: <i className="fa-solid fa-note-sticky" aria-hidden="true" /> },
  { value: 'highlight', label: '划线', icon: <i className="fa-solid fa-highlighter" aria-hidden="true" /> },
  { value: 'bookmark', label: '章节书签', icon: <i className="fa-solid fa-bookmark" aria-hidden="true" /> },
]

function kindLabel(kind: MyAnnotation['kind']) {
  return kind === 'note' ? '私人笔记' : kind === 'highlight' ? '划线' : '章节书签'
}

export default function MyNotesPage() {
  const user = useRequireAuth()
  const { site } = useApp()
  const { showToast, confirmAction } = useFeedback()
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AnnotationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const siteName = site.site_name || 'InfoSphere'

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const result = await api<AnnotationPage>('/users/me/annotations', {
        params: { kind: filter === 'all' ? undefined : filter, page, page_size: 12 },
      })
      setData({ ...result, items: result.items || [] })
    } catch (error) {
      setData({ items: [], total: 0, page: 1, page_size: 12 })
      showToast({ title: '私人笔记加载失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setLoading(false)
    }
  }, [filter, page, showToast, user])

  useEffect(() => { void load() }, [load])

  function switchFilter(next: string) {
    setFilter(next as Filter)
    setPage(1)
    setData(null)
  }

  async function remove(item: MyAnnotation) {
    const confirmed = await confirmAction({
      title: `删除${kindLabel(item.kind)}`,
      message: '删除后无法恢复，是否继续？',
      confirmLabel: '删除',
      danger: true,
    })
    if (!confirmed) return
    setDeleting(item.id)
    try {
      await api(`/annotations/${item.id}`, { method: 'DELETE' })
      showToast({ message: `${kindLabel(item.kind)}已删除`, tone: 'success' })
      if (data?.items.length === 1 && page > 1) setPage((current) => current - 1)
      else await load()
    } catch (error) {
      showToast({ title: '删除失败', message: (error as Error).message, tone: 'error' })
    } finally {
      setDeleting(null)
    }
  }

  if (!user) return <Loading className="min-h-[60vh]" label="正在验证登录状态…" />

  return (
    <>
      <Seo siteName={siteName} title="我的笔记" noindex />
      <Container>
        <div className="flex flex-col justify-between gap-4 pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold text-ink">我的笔记</h1>
            <p className="mt-2 text-sm text-slate-500">集中查看跨设备同步的划线、私人笔记和章节书签。</p>
          </div>
          <Button variant="outline" disabled={loading} onClick={() => void load()}><i className="fa-solid fa-rotate" aria-hidden="true" />刷新</Button>
        </div>

        <SegmentedTabs className="mb-5" value={filter} items={filters} ariaLabel="笔记类型" onChange={switchFilter} />

        {loading || data === null ? (
          <Loading className="py-20" label="正在加载私人笔记…" />
        ) : data.items.length === 0 ? (
          <EmptyState>
            <i className="fa-regular fa-note-sticky mb-3 block text-2xl text-slate-300" aria-hidden="true" />
            暂无{filter === 'all' ? '阅读标注' : kindLabel(filter as MyAnnotation['kind'])}，阅读章节时选中正文即可创建。
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {data.items.map((item) => (
                <Card key={item.id} className="flex min-w-0 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={item.kind === 'note' ? 'primary' : item.kind === 'highlight' ? 'amber' : 'slate'}>{kindLabel(item.kind)}</Badge>
                        {item.anchor_status === 'orphaned' && <Badge tone="rose">原文位置已失效</Badge>}
                        {item.anchor_status === 'relocated' && <Badge tone="slate">已重新定位</Badge>}
                      </div>
                      <Link href={`/book/reader/${encodeURIComponent(item.book_slug)}/${encodeURIComponent(item.document_slug)}`}
                        className="mt-3 block truncate font-semibold text-slate-900 hover:text-primary-600">
                        {item.document_title}
                      </Link>
                      <p className="mt-1 truncate text-xs text-slate-400">《{item.book_title}》</p>
                    </div>
                    <Button size="sm" variant="ghost" loading={deleting === item.id} onClick={() => void remove(item)} className="shrink-0 text-rose-600 hover:bg-rose-50">
                      <i className="fa-solid fa-trash" aria-hidden="true" />删除
                    </Button>
                  </div>
                  {item.quote && <blockquote className="mt-4 line-clamp-4 border-l-2 border-primary-300 pl-3 text-sm leading-6 text-slate-600">{item.quote}</blockquote>}
                  {item.note && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.note}</p>}
                  <p className="mt-auto pt-4 text-xs text-slate-400">更新于 {formatDate(item.updated_at)}</p>
                </Card>
              ))}
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </>
        )}
      </Container>
    </>
  )
}
