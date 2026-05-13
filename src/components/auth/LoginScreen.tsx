import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Eye, EyeOff, ArrowRight, CheckCircle, Fingerprint, ScanFace } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { AuthLanguageToggle } from './AuthLanguageToggle';
import {
  biometricAvailable,
  biometricUnlock,
  enableBiometricLogin,
  disableBiometricLogin,
  tapSuccess,
  tapWarning,
} from '../../lib/capacitorNative';

interface LoginScreenProps {
  onToggle: () => void;
  onForgotPassword: () => void;
}

export function LoginScreen({ onToggle, onForgotPassword }: LoginScreenProps) {
  const { signIn } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Auto-dismiss error after 8s so a transient race condition never
  // leaves a stale red card hanging on the form. Cleared instantly
  // when the user starts typing again.
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!error) return;
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(''), 8000);
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [error]);

  // Clear any displayed error the moment the user starts typing again
  // in either field. Eliminates the "stale red card" flash some users
  // were catching when an old error briefly re-renders during the
  // login → dashboard route transition.
  const clearErrorIfAny = () => { if (error) setError(''); };
  // Biometric state — driven entirely by what the device tells us. None of
  // this kicks in on web (the helpers no-op outside Capacitor).
  const [bioType, setBioType] = useState<'faceId' | 'touchId' | 'fingerprint' | 'multiple' | 'none'>('none');
  const [bioReady, setBioReady] = useState(false); // device has biometry AND we have saved creds for this device
  const [showEnablePrompt, setShowEnablePrompt] = useState(false); // post-success "save for next time?" prompt
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null);

  // On mount, ask the OS what biometry is available + whether we already
  // have a saved login. Both must be true before we surface the unlock
  // button (otherwise the button does nothing and confuses the user).
  useEffect(() => {
    (async () => {
      const probe = await biometricAvailable();
      if (!probe.available) return;
      setBioType(probe.type);
      // Try a "silent" check: does the keychain have credentials for our
      // server tag? We can't ask without prompting biometry, so we instead
      // just optimistically show the button and let the user try.
      // (Actual auth happens on tap.)
      setBioReady(true);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      // Success. If biometry is available on this device AND we don't
      // already have creds saved (or they're stale), offer to enable.
      // We can't introspect the keychain without a prompt, so always offer
      // — re-saving is a no-op if it's the same email/password.
      if (bioType !== 'none') {
        await tapSuccess();
        setPendingCreds({ email, password });
        setShowEnablePrompt(true);
      }
    } catch (err: any) {
      await tapWarning();
      if (err.message?.includes('Invalid login credentials') || (err.message?.toLowerCase().includes('invalid') && err.message?.toLowerCase().includes('password'))) {
        setError(isFr
          ? "Email ou mot de passe incorrect. Si vous avez été invité à une ferme sans avoir défini de mot de passe, utilisez « Mot de passe oublié ? » ci-dessous."
          : 'Invalid email or password. If you were invited to a farm and haven\'t set a password yet, use "Forgot password?" below to set one.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError(isFr
          ? 'Veuillez vérifier votre adresse email avant de vous connecter.'
          : 'Please verify your email address before signing in.');
      } else {
        setError(err instanceof Error ? err.message : (isFr ? 'Échec de la connexion' : 'Failed to sign in'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Tap the Face ID / fingerprint button. Prompts biometry, pulls saved
  // creds out of the keychain, runs the standard Supabase password sign-
  // in. Now distinguishes between (a) user cancelled — silent, (b) no
  // creds saved — friendly nudge to sign in once first, (c) biometry
  // failed — surface the message. Previously every failure path was
  // silent and users tapped the button with nothing happening.
  const handleBiometricUnlock = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await biometricUnlock();
      if (!result.ok) {
        switch (result.reason) {
          case 'cancelled':
            // User backed out of the Face ID sheet themselves — silent.
            break;
          case 'no-creds':
            // Most common reason a brand-new user taps the button and
            // nothing happens: they never saved credentials. Tell them.
            setError(isFr
              ? "Aucune identification enregistrée. Connectez-vous une fois avec votre email et mot de passe, puis activez Face ID quand on vous le propose."
              : "No saved login yet. Sign in once with your email and password, then tap Enable when prompted to save biometric unlock.");
            break;
          case 'web':
            // Shouldn't happen — the button doesn't render on web — but
            // safe to handle.
            setError(isFr
              ? "La connexion biométrique n'est disponible que dans l'app mobile."
              : 'Biometric sign-in is only available in the mobile app.');
            break;
          case 'failed':
          default:
            await tapWarning();
            setError(isFr
              ? `Échec de la biométrie : ${result.message || 'réessayez ou utilisez le mot de passe.'}`
              : `Biometric sign-in failed: ${result.message || 'try again or use your password.'}`);
            break;
        }
        return;
      }
      // Success — hand off to Supabase.
      await signIn(result.email, result.secret);
      await tapSuccess();
    } catch (err: any) {
      await tapWarning();
      // If the password was rotated server-side, the saved creds are now
      // stale. Wipe them so the next launch shows the manual form clean,
      // and surface a helpful message instead of the raw Supabase error.
      if (err.message?.includes('Invalid login credentials')) {
        await disableBiometricLogin();
        setBioReady(false);
        setError(isFr
          ? 'Le mot de passe enregistré a expiré. Veuillez vous reconnecter manuellement.'
          : 'Saved password is out of date. Please sign in manually once.');
      } else {
        setError(err instanceof Error ? err.message : (isFr ? 'Échec de la connexion' : 'Failed to sign in'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEnableBiometric = async () => {
    if (!pendingCreds) { setShowEnablePrompt(false); return; }
    await enableBiometricLogin(pendingCreds.email, pendingCreds.password);
    await tapSuccess();
    setShowEnablePrompt(false);
    setPendingCreds(null);
    // Auth context will navigate away on session change anyway.
  };

  const handleDeclineBiometric = () => {
    setShowEnablePrompt(false);
    setPendingCreds(null);
  };

  // Pick the right icon + label for the device's biometry type.
  const bioLabel = bioType === 'faceId'
    ? (isFr ? 'Déverrouiller avec Face ID' : 'Unlock with Face ID')
    : bioType === 'touchId'
    ? (isFr ? 'Déverrouiller avec Touch ID' : 'Unlock with Touch ID')
    : (isFr ? 'Déverrouiller avec empreinte' : 'Unlock with fingerprint');
  const BioIcon = bioType === 'faceId' ? ScanFace : Fingerprint;

  return (
    <div className="min-h-screen flex relative">
      {/* Top-right language toggle — visible on every breakpoint so a
          first-time French user can flip without scrolling. Auto-detect
          (browser/OS locale → src/lib/i18n.ts) usually picks the right
          one already; this is the manual override. */}
      <div className="absolute top-4 right-4 z-20">
        <AuthLanguageToggle />
      </div>
      <style>{`
        @keyframes neonFlicker {
          0%, 18%, 22%, 25%, 53%, 57%, 100% {
            color: #ffdd00;
            text-shadow: 0 0 6px rgba(255,221,0,0.9), 0 0 16px rgba(255,221,0,0.7), 0 0 32px rgba(255,221,0,0.5);
          }
          20%, 24%, 55% {
            color: rgba(255,221,0,0.5);
            text-shadow: none;
          }
        }
        .neon-track { animation: neonFlicker 5s ease-in-out infinite; color: #ffdd00; text-shadow: 0 0 6px rgba(255,221,0,0.9), 0 0 16px rgba(255,221,0,0.7), 0 0 32px rgba(255,221,0,0.5); }
        .auth-grid {
          background-image: linear-gradient(rgba(255,221,0,0.05) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,221,0,0.05) 1px, transparent 1px);
          background-size: 48px 48px;
        }
      `}</style>

      {/* LEFT PANEL */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-14 auth-grid" style={{ background: '#0a0a0a' }}>
        {/* radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 70% 60% at 30% 40%, rgba(255,221,0,0.06) 0%, transparent 70%)',
        }} />

        {/* Wordmark */}
        <div className="relative">
          <span className="text-3xl font-black tracking-tight">
            <span className="text-white">EDEN</span>
            <span className="neon-track">TRACK</span>
          </span>
        </div>

        {/* Center content */}
        <div className="relative space-y-8">
          <div>
            <h2 className="text-4xl font-extrabold text-white leading-tight mb-4 tracking-tight">
              {isFr ? <>Gérez votre ferme<br /><span style={{ color: '#ffdd00' }}>comme un professionnel</span></> : <>Run your farm<br /><span style={{ color: '#ffdd00' }}>like a professional</span></>}
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed max-w-sm">
              {isFr
                ? "Tout ce qu'il faut pour gérer votre ferme. Volailles, poissons ou lapins. Dans une seule application qui fonctionne même sans internet."
                : 'Everything you need to manage your farm. Poultry, fish or rabbits. In one app that works even without internet.'}
            </p>
          </div>

          <ul className="space-y-4">
            {(isFr
              ? [
                  'Suivez troupeaux, étangs, clapiers et dépenses',
                  "Eden AI diagnostique la santé et enregistre les données",
                  'Fonctionne hors-ligne, sans signal',
                  'Rapports email hebdomadaires, générés automatiquement',
                ]
              : [
                  'Track flocks, ponds, hutches and expenses',
                  'Eden AI diagnoses health and logs data',
                  'Offline-first, works with no signal',
                  'Weekly email reports, auto-generated',
                ]).map(item => (
              <li key={item} className="flex items-center gap-3 text-sm text-gray-300">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,221,0,0.15)', border: '1px solid rgba(255,221,0,0.3)' }}>
                  <CheckCircle className="w-3 h-3" style={{ color: '#ffdd00' }} />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom */}
        <div className="relative">
          <p className="text-xs text-gray-600">{isFr ? 'Adoptée par des éleveurs partout dans le monde.' : 'Trusted by farmers worldwide.'}</p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile wordmark */}
          <div className="lg:hidden mb-10 text-center">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-gray-900">EDEN</span>
              <span style={{ color: '#d97706' }}>TRACK</span>
            </span>
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-1 tracking-tight">{t('auth.welcome')}</h1>
          <p className="text-gray-400 mb-8 text-sm">{t('auth.sign_in')}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-red-600 leading-relaxed">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearErrorIfAny(); }}
                required
                disabled={loading}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                style={{ '--tw-ring-color': 'rgba(255,221,0,0.4)' } as any}
                placeholder={t('auth.enter_email')}
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                  {t('auth.password')}
                </label>
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={loading}
                  className="text-sm text-gray-400 hover:text-gray-700 font-medium transition-colors disabled:opacity-50"
                >
                  {t('auth.forgot_password')}
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearErrorIfAny(); }}
                  required
                  disabled={loading}
                  className="w-full h-12 px-4 pr-12 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                  placeholder={t('auth.enter_password')}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-gray-900 transition-all hover:brightness-105 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              style={{ background: '#ffdd00', boxShadow: '0 4px 16px rgba(255,221,0,0.3)' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                  {t('auth.signing_in')}
                </>
              ) : (
                <>
                  {t('auth.sign_in')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Biometric unlock — only renders when the device has Face ID /
                Touch ID / fingerprint enrolled. We don't gate on whether
                creds are saved (we can't introspect without prompting), so
                tapping when no creds are saved just no-ops silently. */}
            {bioReady && (
              <button
                type="button"
                onClick={handleBiometricUnlock}
                disabled={loading}
                className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                <BioIcon className="w-4 h-4" />
                {bioLabel}
              </button>
            )}
          </form>

          <p className="mt-8 text-center text-sm text-gray-400">
            {t('auth.dont_have_account')}{' '}
            <button
              onClick={onToggle}
              disabled={loading}
              className="text-gray-900 font-bold hover:underline disabled:opacity-50"
            >
              {t('auth.sign_up')}
            </button>
          </p>
        </div>
      </div>

      {/* Post-login prompt: "Save credentials for biometric unlock?"
          Shows once after a successful manual sign-in. The session is
          already live by the time this renders — choosing skip just
          means the user types the password again next time. */}
      {showEnablePrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full sm:max-w-sm p-6 space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,221,0,0.15)' }}>
                <BioIcon className="w-7 h-7" style={{ color: '#d97706' }} />
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center">
              {bioType === 'faceId'
                ? (isFr ? 'Activer Face ID ?' : 'Enable Face ID?')
                : bioType === 'touchId'
                ? (isFr ? 'Activer Touch ID ?' : 'Enable Touch ID?')
                : (isFr ? 'Activer la connexion par empreinte ?' : 'Enable fingerprint sign-in?')}
            </h3>
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              {isFr
                ? 'Connectez-vous plus rapidement la prochaine fois sans saisir votre mot de passe. Vos identifiants sont stockés dans le trousseau sécurisé de votre appareil.'
                : 'Sign in faster next time without typing your password. Credentials are stored in your device\'s secure keychain.'}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleDeclineBiometric}
                className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {isFr ? 'Pas maintenant' : 'Not now'}
              </button>
              <button
                onClick={handleEnableBiometric}
                className="flex-1 h-11 rounded-xl text-sm font-bold text-gray-900 transition-all hover:brightness-105"
                style={{ background: '#ffdd00' }}
              >
                {isFr ? 'Activer' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
