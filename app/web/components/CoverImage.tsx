import { useEffect, useRef, useState } from 'react'

// CoverImage 封面图加载态：加载时露出父级的渐变占位（父级需带背景），封面加载完成后淡入，避免生硬跳出；
// 加载失败则自身隐藏，继续保留父级渐变兜底。
export default function CoverImage({ src, alt, imgClassName }: { src: string; alt: string; imgClassName?: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')

  // 命中缓存的图片可能在 onLoad 绑定前就已完成、事件不再触发，导致一直停在“加载中”不淡入。
  // 挂载时用 img.complete 兜底判断一次。
  useEffect(() => {
    const img = ref.current
    if (!img || !img.complete) return
    setState(img.naturalWidth > 0 ? 'loaded' : 'error')
  }, [src])

  if (state === 'error') return null
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setState('loaded')}
      onError={() => setState('error')}
      className={`h-full w-full object-cover transition-opacity duration-500 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'} ${imgClassName || ''}`}
    />
  )
}
