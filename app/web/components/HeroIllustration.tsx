import Link from 'next/link'
import { API_BASE, formatNumber } from '@/lib/api'
import type { Book } from '@/lib/types'

const topicChips = [
  { label: '方法论', className: 'left-2 top-10 bg-violet-100/90 text-violet-600' },
  { label: '写作', className: 'left-6 top-40 bg-sky-100/90 text-sky-600' },
  { label: '编程', className: 'left-1/4 bottom-8 bg-emerald-100/90 text-emerald-600' },
  { label: '设计', className: 'right-4 top-1/3 bg-amber-100/90 text-amber-600' },
  { label: '思考', className: 'right-10 bottom-10 bg-emerald-100/90 text-emerald-600' },
]

const rankColors = ['text-amber-400', 'text-sky-400', 'text-violet-400', 'text-emerald-400', 'text-slate-400']

function CardFace({ book }: { book?: Book }) {
  const cover = book?.cover_image ? API_BASE + book.cover_image : ''
  return (
    <>
      <div className={`h-20 w-full rounded-lg ${cover ? '' : 'bg-gradient-to-br from-primary-400 to-violet-400'}`}>
        {cover && <img src={cover} alt="" className="h-full w-full rounded-lg object-cover" />}
      </div>
      <div className="mt-2 truncate text-xs font-medium text-slate-800">{book?.title || '你的第一本书'}</div>
      <div className="mt-1.5 h-1.5 w-3/4 rounded-full bg-slate-100" />
      <div className="mt-1 h-1.5 w-1/2 rounded-full bg-slate-100" />
    </>
  )
}

// HeroIllustration 首页右侧的知识网络插画：漂浮书卡 + 主题气泡 + 连线
export default function HeroIllustration({ books }: { books: Book[] }) {
  const cards = books.slice(0, 3)
  const positions = [
    'left-6 top-6 w-40 -rotate-3',
    'left-1/2 top-16 w-44 -translate-x-1/2 rotate-2 shadow-xl',
    'right-8 bottom-10 w-40 rotate-3',
  ]
  return (
    <div className="relative hidden h-[380px] select-none lg:block" aria-hidden="true">
      {/* 柔和渐变底 */}
      <div className="absolute inset-4 rounded-[48px] bg-gradient-to-br from-primary-100/80 via-indigo-100/60 to-purple-100/80 blur-2xl" />

      {/* 知识连线 */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 520 380" fill="none">
        <path d="M80 70 C 180 150, 340 30, 450 90" stroke="#c9d9f8" strokeWidth="1.5" strokeDasharray="1 7" strokeLinecap="round" />
        <path d="M60 200 C 160 260, 360 300, 470 240" stroke="#c9d9f8" strokeWidth="1.5" strokeDasharray="1 7" strokeLinecap="round" />
        <path d="M150 40 C 220 180, 300 220, 420 330" stroke="#d8e3fb" strokeWidth="1.5" strokeDasharray="1 7" strokeLinecap="round" />
        <path d="M40 120 C 140 90, 250 320, 380 60" stroke="#d8e3fb" strokeWidth="1.5" strokeDasharray="1 7" strokeLinecap="round" />
        {[[80, 70], [450, 90], [60, 200], [470, 240], [380, 60], [150, 330]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="4" fill="#8fb2f5" />
        ))}
      </svg>

      {/* 主题气泡 */}
      {topicChips.map((chip) => (
        <span key={chip.label}
          className={`absolute rounded-full px-3 py-1 text-xs font-medium shadow-sm ${chip.className}`}>
          {chip.label}
        </span>
      ))}

      {/* 漂浮书卡（取最新书籍真实数据） */}
      {positions.map((pos, i) => (
        <div key={i} className={`absolute rounded-xl border border-slate-100 bg-white p-3 shadow-lg ${pos}`}>
          <CardFace book={cards[i]} />
        </div>
      ))}
    </div>
  )
}

// HotRankCard 深色热门榜单卡片
export function HotRankCard({ rank, book }: { rank: number; book: Book }) {
  const cover = book.cover_image ? API_BASE + book.cover_image : ''
  return (
    <Link href={`/book/detail?slug=${encodeURIComponent(book.slug)}`}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10">
      <span className={`w-6 shrink-0 text-center text-2xl font-bold ${rankColors[rank - 1] || 'text-slate-400'}`}>{rank}</span>
      <div className={`h-16 w-12 shrink-0 overflow-hidden rounded-md ${cover ? '' : 'bg-gradient-to-br from-primary-400 to-violet-400'}`}>
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{book.title}</div>
        <div className="mt-1.5 text-xs text-slate-400">👁 {formatNumber(book.view_count)}</div>
      </div>
    </Link>
  )
}
