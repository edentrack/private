/**
 * AuthLanguageToggle — small EN/FR pill for the Login/SignUp screens.
 *
 * The auth screens are where a brand-new user lands first, before any
 * profile exists. We auto-detect browser/OS language in src/lib/i18n.ts
 * (so a phone set to French gets a French signup automatically), but
 * we still surface a visible toggle so:
 *   - Anyone can override the detection without hunting through Settings
 *   - The choice they make here is persisted to localStorage and, after
 *     signup, copied to profiles.preferred_language by AuthContext —
 *     which means Eden AI's first reply is already in their language.
 */

import { useLanguage } from '../../contexts/LanguageContext';

export function AuthLanguageToggle({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 p-0.5 shadow-sm ${className}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
          language === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-pressed={language === 'en'}
      >
        🇬🇧 EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('fr')}
        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
          language === 'fr' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-pressed={language === 'fr'}
      >
        🇫🇷 FR
      </button>
    </div>
  );
}

export default AuthLanguageToggle;
