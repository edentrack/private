import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import fr from '../locales/fr.json';

const SUPPORTED = ['en', 'fr'] as const;
type Lang = (typeof SUPPORTED)[number];

/**
 * Detect language for first-time visitors.
 *
 * Priority:
 *   1. localStorage `preferred_language` (returning visitor)
 *   2. URL `?lang=fr` (deep-link override — useful for marketing)
 *   3. `navigator.languages` / `navigator.language` — first match in
 *      our supported list. This catches browsers AND mobile WebViews
 *      (Capacitor exposes the OS locale via navigator), so a user
 *      whose phone is set to French sees a French signup the first
 *      time the app opens. No language-toggle hunt required.
 *   4. fallback `en`.
 */
function detectInitialLanguage(): Lang {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('preferred_language');
  if (saved && (SUPPORTED as readonly string[]).includes(saved)) return saved as Lang;

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('lang') || new URLSearchParams(url.hash.split('?')[1] || '').get('lang');
  if (fromUrl && (SUPPORTED as readonly string[]).includes(fromUrl)) {
    localStorage.setItem('preferred_language', fromUrl);
    return fromUrl as Lang;
  }

  const navLangs: string[] = Array.isArray((navigator as any).languages) && (navigator as any).languages.length > 0
    ? (navigator as any).languages
    : [navigator.language || 'en'];
  for (const raw of navLangs) {
    const tag = String(raw).toLowerCase().split(/[-_]/)[0];
    if ((SUPPORTED as readonly string[]).includes(tag)) {
      // Persist so we don't re-detect every reload (and so the picker
      // on auth screens reflects the auto-detected choice).
      localStorage.setItem('preferred_language', tag);
      return tag as Lang;
    }
  }
  return 'en';
}

const savedLanguage = detectInitialLanguage();

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
