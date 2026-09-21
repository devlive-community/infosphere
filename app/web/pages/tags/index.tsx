import { useEffect, useState } from 'react'
import Link from 'next/link'
import Container from '@/components/Container'
import Seo from '@/components/Seo'
import FeatureGate from '@/components/FeatureGate'
import ResourceIcon from '@/components/ResourceIcon'
import { api, formatNumber } from '@/lib/api'
import { useApp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { EmptyState, Loading } from '@/components/ui'
import type { Tag } from '@/lib/types'

// 全部标签页：列出所有有公开书籍的标签（含图标与使用计数），点击进入按标签检索。
export default function AllTags() {
  return <FeatureGate feature="tags"><AllTagsInner /></FeatureGate>
}

function AllTagsInner() {
  const { t } = useTranslation()
  const { site } = useApp()
  const [tags, setTags] = useState<Tag[] | null>(null)

  useEffect(() => {
    api<Tag[]>('/tags', { params: { limit: 200 } }).then((d) => setTags(d || [])).catch(() => setTags([]))
  }, [])

  return (
    <>
      <Seo siteName={site.site_name || 'KnowForge'} title={t('tags.all.title')} description={t('tags.all.subtitle')} />
      <Container>
        <div className="py-8">
          <h1 className="text-2xl font-bold text-ink">{t('tags.all.title')}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t('tags.all.subtitle')}</p>

          <div className="mt-6">
            {tags === null ? (
              <Loading label={t('tags.all.loading')} />
            ) : tags.length === 0 ? (
              <EmptyState>{t('tags.all.empty')}</EmptyState>
            ) : (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">
                {tags.map((tag) => (
                  <Link key={tag.id} href={`/explore?tag=${encodeURIComponent(tag.slug)}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-primary-300 hover:bg-primary-50/40">
                    <ResourceIcon iconType={tag.icon_type} iconValue={tag.icon_value} name={tag.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{tag.name}</span>
                      <span className="text-xs text-slate-400">{t('tags.all.bookCount', { count: formatNumber(tag.book_count || 0) })}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </Container>
    </>
  )
}
