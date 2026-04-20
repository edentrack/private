import { createContext, useContext, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
import { supabase } from '../lib/supabaseClient';

type Language = 'en' | 'fr';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, options?: any) => string;
  languages: Array<{ code: Language; name: string; flag: string }>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const languageOptions = [
  { code: 'en' as Language, name: 'English', flag: '🇬🇧' },
  { code: 'fr' as Language, name: 'Français', flag: '🇫🇷' }
];

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { t, i18n: i18nInstance } = useTranslation();

  const setLanguage = async (lang: Language) => {
    try {
      await i18nInstance.changeLanguage(lang);
      localStorage.setItem('preferred_language', lang);
      document.documentElement.lang = lang;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('profiles')
          .update({ preferred_language: lang })
          .eq('id', user.id);

        if (error && import.meta.env.DEV) {
          console.warn('Failed to save language preference:', error);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Language change error:', error);
      throw error;
    }
  };

  const currentLanguage = (i18nInstance.language || 'en') as Language;

  return (
    <LanguageContext.Provider value={{
      language: currentLanguage,
      setLanguage,
      t,
      languages: languageOptions
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
