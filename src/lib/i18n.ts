import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import fr from '../locales/fr.json';

// Load saved language preference or default to English
const savedLanguage = typeof window !== 'undefined' 
  ? localStorage.getItem('preferred_language') || 'en'
  : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr }
      // Add more languages here in the future:
      // es: { translation: es },  // Spanish
      // pt: { translation: pt },  // Portuguese
      // etc.
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    returnObjects: false, // Always return strings, never objects
    returnEmptyString: false, // Return key if translation is missing
    returnNull: false, // Return key if translation is missing
    keySeparator: '.', // Use dot as key separator
    nsSeparator: ':', // Use colon as namespace separator
    interpolation: {
      escapeValue: false, // React already escapes by default
      formatSeparator: ','
    },
    react: {
      useSuspense: false // Disable suspense for better compatibility
    },
    // Support for pluralization and context
    compatibilityJSON: 'v4'
  });

// Sync language changes with localStorage
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('preferred_language', lng);
    document.documentElement.lang = lng;
  }
});

// Set initial HTML lang attribute
if (typeof window !== 'undefined') {
  document.documentElement.lang = savedLanguage;
}

export const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
};

export default i18n;
