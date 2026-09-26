import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 只声明与 tsconfig 一致的 @/ 路径别名，其余沿用 vitest 默认配置
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
})
