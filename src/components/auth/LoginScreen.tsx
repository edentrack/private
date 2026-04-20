import { useState } from 'react';
import { AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { LogoFull, LogoIcon } from '../common/Logo';

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
        setError('Invalid email or password. If you were invited to a farm and haven’t set a password yet, use “Forgot password?” below to set one.');
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
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/image%20copy%20copy%20copy.png')] bg-center bg-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
        <div className="relative z-10 flex flex-col justify-center px-16">
          <h2 className="text-4xl font-bold text-white mb-4 drop-shadow-lg">
            Professional Farm<br />Management Worldwide
          </h2>
          <p className="text-white/90 text-lg max-w-md drop-shadow-md">
            Track flocks, monitor health, manage inventory, and grow your poultry business with EDENTRACK. Trusted by farmers globally.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="lg:hidden mb-8 text-center">
            <LogoIcon size="lg" className="mb-4 inline-block" />
            <h2 className="text-xl font-bold text-gray-900">EDENTRACK</h2>
            <p className="text-sm text-gray-600">Professional Farm Management</p>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('auth.welcome')}</h1>
          <p className="text-gray-500 mb-8">{t('auth.sign_in')}</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl animate-fade-in">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="input-light"
                placeholder={t('auth.enter_email')}
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  {t('auth.password')}
                </label>
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={loading}
                  className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors disabled:opacity-50"
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
                  className="input-light pr-12"
                  placeholder={t('auth.enter_password')}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-neon w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                  {t('auth.signing_in')}
                </>
              ) : (
                <>
                  {t('auth.sign_in')}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-gray-500">
            {t('auth.dont_have_account')}{' '}
            <button
              onClick={onToggle}
              disabled={loading}
              className="text-gray-900 font-semibold hover:underline disabled:opacity-50"
            >
              {t('auth.sign_up')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
