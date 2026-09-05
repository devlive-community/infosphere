// Pagination 通用分页条
export function Pagination({ page, pageSize, total, onChange }: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const list: number[] = []
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) list.push(i)

  const navClass =
    'inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600 ' +
    'transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
  const pageClass = (active: boolean) =>
    `inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm transition-colors ${
      active
        ? 'border-primary-500 bg-primary-500 text-white'
        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
    }`

  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className={navClass}>上一页</button>
      {list[0] > 1 && <span className="px-1 text-slate-400">…</span>}
      {list.map((p) => (
        <button key={p} onClick={() => onChange(p)} className={pageClass(p === page)}>{p}</button>
      ))}
      {list[list.length - 1] < pages && <span className="px-1 text-slate-400">…</span>}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className={navClass}>下一页</button>
    </div>
  )
}
