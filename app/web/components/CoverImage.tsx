import { useState } from 'react'

// CoverImage 带骨架屏的封面图：加载时显示脉冲占位，加载完成后淡入；
// 加载失败则自身隐藏，露出父级的渐变兜底（父级需为 relative 且带背景）。
export default function CoverImage({ src, alt, imgClassName }: { src: string; alt: string; imgClassName?: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  if (state === 'error') return null
  return (
    <>
      {state === 'loading' && <span className="pointer-events-none absolute inset-0 animate-pulse bg-slate-200/70" aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        className={`h-full w-full object-cover transition-opacity duration-500 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'} ${imgClassName || ''}`}
      />
    </>
  )
}
