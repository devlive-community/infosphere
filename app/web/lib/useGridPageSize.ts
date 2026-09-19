import { useEffect, useRef, useState } from 'react'

// useGridPageSize 让「每页数量 = 网格列数 × 行数」随屏宽自适应，使最后一行始终填满（无空白）。
// 用法：把返回的 ref 挂到网格容器（用 grid-cols-[repeat(auto-fill,minmax(<min>,1fr))] 的那个元素），
// minItemRem 与网格 minmax 的最小列宽一致，pageSize 用于列表请求的 page_size。
export function useGridPageSize({ minItemRem, gapRem = 1.25, rows = 3, fallback = 12 }: {
  minItemRem: number
  gapRem?: number
  rows?: number
  fallback?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pageSize, setPageSize] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize || '16') || 16
    const measure = () => {
      const width = el.clientWidth
      if (width <= 0) return
      const item = minItemRem * rootFont
      const gap = gapRem * rootFont
      const cols = Math.max(1, Math.floor((width + gap) / (item + gap)))
      setPageSize(cols * rows)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [minItemRem, gapRem, rows])

  return { ref, pageSize }
}
