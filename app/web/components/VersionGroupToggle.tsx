import { Checkbox, Tooltip } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

// VersionGroupToggle 书籍列表的「版本聚合」开关：状态由调用方放在 URL 查询参数（versions=grouped）中，
// 切换后由调用方重新加载分页数据（服务端聚合）。
export default function VersionGroupToggle({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <Tooltip content={<span className="block max-w-[16rem] whitespace-normal">{t('book.variant.groupTooltip')}</span>}>
      <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm text-slate-600">
        <Checkbox checked={checked} onChange={onChange} disabled={disabled} ariaLabel={t('book.variant.groupToggle')} />
        {t('book.variant.groupToggle')}
      </label>
    </Tooltip>
  )
}
