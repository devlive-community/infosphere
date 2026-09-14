import Head from 'next/head'
import { useApp } from '@/lib/auth'
import { resolveMediaUrl } from '@/lib/media'

// SiteHead 全站头部：根据站点设置注入自定义 favicon 与关键词，覆盖 _document 中的默认值。
export default function SiteHead() {
  const { site } = useApp()
  const favicon = site.site_favicon ? resolveMediaUrl(site.site_favicon) : ''
  const keywords = site.site_keywords || ''
  return (
    <Head>
      {favicon && <link key="favicon" rel="icon" href={favicon} />}
      {favicon && <link key="apple-touch-icon" rel="apple-touch-icon" href={favicon} />}
      {keywords && <meta key="keywords" name="keywords" content={keywords} />}
    </Head>
  )
}
