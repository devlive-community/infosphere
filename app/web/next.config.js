/** @type {import('next').NextConfig} */
const nextConfig = {
  // SSR 独立部署模式：CI 将 .next/standalone 打包为 infosphere-web 服务
  output: 'standalone',
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  compress: true,
}

module.exports = nextConfig
