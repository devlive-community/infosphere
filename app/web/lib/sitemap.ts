import fs from 'fs'
import path from 'path'

// sitemap 静态文件读取：XML 由 Go 后台任务（sitemap.generate，每 24 小时）生成并落盘，
// web 路由只负责读文件返回，不做任何构建。目录由 SITEMAP_DIR 环境变量约定，
// 未设置时默认本目录（与 Go 端探测路径 app/web/.sitemap-cache 一致）。
export const SITEMAP_DIR = process.env.SITEMAP_DIR || path.join(process.cwd(), '.sitemap-cache')

// 读取 sitemap 静态文件；不存在返回 null（路由返回 404）
export function readSitemapFile(name: string): string | null {
  if (!/^[\w.-]+\.xml$/.test(name)) return null
  try {
    return fs.readFileSync(path.join(SITEMAP_DIR, name), 'utf-8')
  } catch {
    return null
  }
}
