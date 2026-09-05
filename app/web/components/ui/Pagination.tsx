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
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn-outline px-3 py-1.5">上一页</button>
      {list[0] > 1 && <span className="px-1 text-slate-400">…</span>}
      {list.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`btn px-3 py-1.5 ${p === page ? 'bg-primary-500 text-white' : 'border border-slate-300 bg-white hover:bg-slate-100'}`}>{p}</button>
      ))}
      {list[list.length - 1] < pages && <span className="px-1 text-slate-400">…</span>}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="btn-outline px-3 py-1.5">下一页</button>
    </div>
  )
}
