import { FileTextIcon, FolderIcon } from '@/components/icons'
import { faIconClass } from '@/lib/fa-icon'

// DocTreeIcon 目录树节点图标：章节配置了 <!-- icon: xxx --> 时渲染对应 FontAwesome 图标，
// 否则回退到默认的文件夹/文档图标。colorClass 控制颜色（选中态等），组件自身负责尺寸对齐。
export default function DocTreeIcon({ icon, hasChildren, colorClass = 'text-slate-400' }: { icon?: string; hasChildren?: boolean; colorClass?: string }) {
  const fa = faIconClass(icon)
  if (fa) return <i className={`fa-fw shrink-0 text-center text-[15px] leading-4 ${fa} ${colorClass}`} aria-hidden="true" />
  return hasChildren
    ? <FolderIcon className={`h-4 w-4 shrink-0 ${colorClass}`} />
    : <FileTextIcon className={`h-4 w-4 shrink-0 ${colorClass}`} />
}
