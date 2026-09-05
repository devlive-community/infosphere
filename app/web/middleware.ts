import { NextRequest, NextResponse } from 'next/server'

// 安装守卫中间件：未安装时所有页面（除 /install）一律服务端重定向到安装向导；
// 已安装时访问 /install 会被送回首页。安装状态来自 Go API（data/config.json）。
const API_INTERNAL = process.env.INFO_SPHERE_API_URL || 'http://127.0.0.1:6969'

const INSTALL_PATH = '/install'

// 模块级缓存：避免每个请求都探测一次安装状态
let cache: { installed: boolean; expires: number } | null = null

async function checkInstalled(): Promise<boolean> {
  if (cache && cache.expires > Date.now()) return cache.installed
  try {
    const res = await fetch(`${API_INTERNAL}/api/v1/setup/status`, { cache: 'no-store' })
    const payload = await res.json()
    const installed = payload?.data?.installed === true
    cache = { installed, expires: Date.now() + 3_000 }
    return installed
  } catch {
    return cache?.installed ?? false
  }
}

export async function middleware(req: NextRequest) {
  const installed = await checkInstalled()
  const { pathname } = req.nextUrl

  if (!installed && pathname !== INSTALL_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = INSTALL_PATH
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (installed && pathname === INSTALL_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

// 页面请求全部经过中间件；静态资源、内建 API 与上传文件除外
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|uploads/).*)'],
}
