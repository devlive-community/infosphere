import type { Document } from '@/lib/types'
import type { ReactNode } from 'react'

interface DocTreeProps {
  items?: Document[]
  activeId?: number
  itemRender: (item: Document) => ReactNode
}

// DocTree 递归渲染文档树；itemRender(item) 返回每个节点的展示内容
export default function DocTree({ items, activeId, itemRender }: DocTreeProps) {
  if (!items || items.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">暂无章节</p>
  }
  return <ul className="space-y-0.5">{renderItems(items, activeId, itemRender)}</ul>
}

function renderItems(items: Document[], activeId: number | undefined, itemRender: (item: Document) => ReactNode) {
  return items.map((item) => (
    <li key={item.id}>
      <div className={`flex items-center rounded-md px-2 py-1.5 text-sm ${activeId === item.id ? 'bg-primary-50 font-medium text-primary-600' : 'hover:bg-slate-100'}`}>
        {itemRender(item)}
      </div>
      {item.children && item.children.length > 0 && (
        <ul className="ml-4 border-l border-slate-200 pl-2">
          {renderItems(item.children, activeId, itemRender)}
        </ul>
      )}
    </li>
  ))
}
