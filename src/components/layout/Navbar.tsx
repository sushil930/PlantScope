import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Leaf, Menu, X } from 'lucide-react';
import { persistLanguage, type SupportedUiLanguage } from '../../i18n';

export function Navbar() {
  const { t, i18n } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentLang: SupportedUiLanguage = i18n.language?.startsWith('hi') ? 'hi' : 'en';

  const handleLanguageChange = (lang: SupportedUiLanguage) => {
    void i18n.changeLanguage(lang);
    persistLanguage(lang);
    document.documentElement.lang = lang;
  };

  const navItems = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/identify', label: t('nav.identify'), end: false },
    { to: '/history', label: t('nav.history'), end: false },
    { to: '/about', label: t('nav.about'), end: false },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#DCE4DF] bg-white/95 backdrop-blur-xs no-print">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-[#111C17] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#166534] rounded-sm"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#166534] text-white shrink-0">
            <Leaf className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>{t('brand')}</span>
        </Link>

        {/* Zone 2: 4 clean single-line navigation links */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-7">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative py-5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 ${
                  isActive
                    ? 'text-[#166534] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#166534]'
                    : 'text-[#4B5D54] hover:text-[#111C17]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Zone 3: Language toggle + mobile menu trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            role="group"
            aria-label={t('nav.languageLabel')}
            className="inline-flex items-center rounded-md border border-[#DCE4DF] bg-[#F1F5F3] p-0.5"
          >
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              aria-pressed={currentLang === 'en'}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                currentLang === 'en'
                  ? 'bg-white text-[#111C17] shadow-2xs'
                  : 'text-[#4B5D54] hover:text-[#111C17]'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('hi')}
              aria-pressed={currentLang === 'hi'}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                currentLang === 'hi'
                  ? 'bg-white text-[#111C17] shadow-2xs'
                  : 'text-[#4B5D54] hover:text-[#111C17]'
              }`}
            >
              हिन्दी
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label={t('nav.toggleMenu')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#DCE4DF] text-[#111C17] hover:bg-[#F1F5F3] md:hidden cursor-pointer"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation panel */}
      {mobileOpen && (
        <nav
          aria-label="Mobile navigation"
          className="border-t border-[#DCE4DF] bg-white px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#ECFDF3] text-[#166534]'
                      : 'text-[#4B5D54] hover:bg-[#F1F5F3] hover:text-[#111C17]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
