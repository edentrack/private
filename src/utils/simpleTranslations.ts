import { useState, useEffect, useCallback } from 'react';
import en from '../locales/en.json';
import fr from '../locales/fr.json';

type Language = 'en' | 'fr';
type TranslationVars = Record<string, string | number>;

const FALLBACK_LANGUAGE: Language = 'en';
const TRANSLATIONS: Record<Language, Record<string, any>> = { en, fr };
const STORAGE_KEY = 'preferred_language';

// Custom event for language changes
const LANGUAGE_CHANGE_EVENT = 'language-change';

const getStoredLanguage = (): Language => {
  if (typeof window === 'undefined') return FALLBACK_LANGUAGE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (stored === 'fr' || stored === 'en') ? stored : FALLBACK_LANGUAGE;
};

const setStoredLanguage = (language: Language) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, language);
  document.documentElement.lang = language;
  // Dispatch custom event to notify all listeners
  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: language }));
};

const getNestedValue = (obj: Record<string, any>, path: string): unknown => {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, any>)) {
      return (acc as Record<string, any>)[key];
    }
    return undefined;
  }, obj);
};

const interpolate = (value: string, vars?: TranslationVars): string => {
  if (!vars) return value;
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const replacement = vars[key];
    return replacement === undefined || replacement === null ? '' : String(replacement);
  });
};

const resolveTranslation = (key: string, language: Language): string => {
  const langTable = TRANSLATIONS[language] || TRANSLATIONS[FALLBACK_LANGUAGE];
  let value = getNestedValue(langTable, key);

  if (typeof value === 'string') return value;

  if (!key.includes('.')) {
    const fallbacks = [
      `common.${key}`,
      `nav.${key}`,
      `dashboard.${key}`,
      `settings.${key}`,
      `errors.${key}`,
    ];

    for (const candidate of fallbacks) {
      value = getNestedValue(langTable, candidate);
      if (typeof value === 'string') return value;
    }
  }

  if (language !== FALLBACK_LANGUAGE) {
    return resolveTranslation(key, FALLBACK_LANGUAGE);
  }

  return key;
};

export const t = (key: string, vars?: TranslationVars): string => {
  const language = getStoredLanguage();
  return interpolate(resolveTranslation(key, language), vars);
};

export function useTranslate() {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage());

  // Listen for language changes from other components
  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent<Language>;
      setLanguageState(customEvent.detail);
    };

    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    return () => {
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    };
  }, []);

  const translate = useCallback((key: string, vars?: TranslationVars) => {
    return interpolate(resolveTranslation(key, language), vars);
  }, [language]);

  const changeLanguage = useCallback((nextLanguage: Language) => {
    setStoredLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  return {
    t: translate,
    language,
    changeLanguage,
  };
}
