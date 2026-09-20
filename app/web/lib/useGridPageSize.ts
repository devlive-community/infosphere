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
    let lastWidth = -1
    let raf = 0
    const measure = () => {
      const width = el.clientWidth
      if (width <= 0) return
      // 忽略亚像素级抖动，避免在列边界附近来回切换列数导致闪烁。
      if (Math.abs(width - lastWidth) < 1) return
      lastWidth = width
      const item = minItemRem * rootFont
      const gap = gapRem * rootFont
      const cols = Math.max(1, Math.floor((width + gap) / (item + gap)))
      setPageSize(cols * rows)
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; measure() })
    }
    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [minItemRem, gapRem, rows])

  return { ref, pageSize }
}
