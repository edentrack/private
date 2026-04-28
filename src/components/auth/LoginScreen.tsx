import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface LoginScreenProps {
  onToggle: () => void;
  onForgotPassword: () => void;
}

export function LoginScreen({ onToggle, onForgotPassword }: LoginScreenProps) {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      if (err.message?.includes('Invalid login credentials') || (err.message?.toLowerCase().includes('invalid') && err.message?.toLowerCase().includes('password'))) {
        setError('Invalid email or password. If you were invited to a farm and haven\'t set a password yet, use "Forgot password?" below to set one.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Please verify your email address before signing in.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to sign in');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
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
              Run your farm<br />
              <span style={{ color: '#ffdd00' }}>like a professional</span>
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed max-w-sm">
              Everything you need to manage your poultry farm — in one app that works even without internet.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              'Track flocks, eggs, feed and expenses',
              'Eden AI diagnoses health and logs data',
              'Offline-first — works with no signal',
              'Weekly email reports, auto-generated',
            ].map(item => (
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
          <p className="text-xs text-gray-600">Trusted by poultry farmers worldwide.</p>
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
                onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
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
    </div>
  );
}
