import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-[#DCE4DF] bg-white no-print">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#111C17]">{t('footer.attribution')}</p>
          <p className="text-xs text-[#4B5D54]">{t('footer.freeNotice')}</p>
        </div>
        <div className="flex items-center gap-6 text-xs font-medium text-[#4B5D54]">
          <Link to="/identify" className="hover:text-[#111C17] transition-colors whitespace-nowrap">
            {t('nav.identify')}
          </Link>
          <Link to="/history" className="hover:text-[#111C17] transition-colors whitespace-nowrap">
            {t('nav.history')}
          </Link>
          <Link to="/about" className="hover:text-[#111C17] transition-colors whitespace-nowrap">
            {t('nav.about')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
