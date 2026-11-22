import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';

export const LANGUAGE_STORAGE_KEY = 'plantscope_language';
export type SupportedUiLanguage = 'en' | 'hi';

export function getSavedLanguage(): SupportedUiLanguage {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'hi' || stored === 'en') {
      return stored;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'en';
}

export function persistLanguage(lang: SupportedUiLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage access errors
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: getSavedLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
