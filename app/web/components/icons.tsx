// 内联 SVG 图标集（lucide 风格描边图标）
import { ReactNode } from 'react'

interface IconProps {
  className?: string
}

function svg(path: ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        className={className || 'h-5 w-5'}>
        {path}
      </svg>
    )
  }
}

export const SearchIcon = svg(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>)

export const UsersIcon = svg(<>
  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
  <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
</>)

export const BookIcon = svg(<>
  <path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
</>)

export const FileTextIcon = svg(<>
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
  <path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
</>)

export const EyeIcon = svg(<>
  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
</>)

export const ShieldIcon = svg(<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />)

export const CloudIcon = svg(<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />)

export const CodeIcon = svg(<><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>)

export const ChevronRightIcon = svg(<path d="m9 18 6-6-6-6" />)

export const ArrowRightIcon = svg(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>)
