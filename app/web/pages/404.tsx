import { ButtonLink } from '@/components/ui'
import { useTranslation } from '@/lib/i18n'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
      <h1 className="text-6xl font-bold text-slate-300">404</h1>
      <p className="mt-4 text-slate-500">{t('error.notfound.message')}</p>
      <ButtonLink href="/">
        {t('error.notfound.backHome')}
      </ButtonLink>
    </div>
  )
}
