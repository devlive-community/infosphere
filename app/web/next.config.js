/** @type {import('next').NextConfig} */
const nextConfig = {
  // SSR 独立部署模式：CI 将 .next/standalone 打包为 infosphere-web 服务
  output: 'standalone',
  // 允许通过 NEXT_DIST_DIR 隔离构建目录，避免本地 dev 与 build 共用 .next 互相覆盖
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  compress: true,
  // 生产由 nginx 将 /api、/uploads 直接分流到 Go 服务；
  // 这里的 rewrites 用于本地直连 Next 端口时自动回源，保证单进程也能工作
  async rewrites() {
    const api = process.env.INFO_SPHERE_API_URL || 'http://127.0.0.1:6969'
    return [
      { source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${api}/uploads/:path*` },
    ]
  },
}

module.exports = nextConfig
