import { useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';;
import { LogoFull, LogoIcon } from '../common/Logo';

interface SignUpScreenProps {
  onToggle: () => void;
}

export function SignUpScreen({ onToggle }: SignUpScreenProps) {
  const { signUp } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = () => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const passwordStrength = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordError = validatePassword();
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, fullName);
      setSuccess('Account created successfully! You can now sign in to your farm.');
      setTimeout(() => {
        try {
          const inviteToken = sessionStorage.getItem('pending_invite_token');
          if (inviteToken) {
            sessionStorage.removeItem('pending_invite_token');
            window.location.hash = `#/invite/${inviteToken}`;
            window.dispatchEvent(new HashChangeEvent('hashchange'));
            return;
          }
        } catch (_) {}
        onToggle();
      }, 1500);
    } catch (err: any) {
      if (err.message?.includes('already registered') || err.message?.includes('User already registered') || err.message?.toLowerCase().includes('already exists')) {
        setError('An account with this email already exists. Sign in instead, or use “Forgot password?” on the sign-in page to set a new password.');
      } else if (err.message?.includes('invalid email')) {
        setError('Please enter a valid email address.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to sign up');
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
            Start your journey<br />to smarter farming
          </h2>
          <p className="text-white/90 text-lg max-w-md drop-shadow-md">
            Join farmers worldwide who trust EDENTRACK to manage their poultry operations efficiently.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="lg:hidden mb-8 text-center">
            <LogoIcon size="lg" className="mb-4 inline-block" />
            <h2 className="text-xl font-bold text-gray-900">EDENTRACK</h2>
            <p className="text-sm text-gray-600">Professional Farm Management</p>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create your account</h1>
          <p className="text-gray-500 mb-8">Get started with your farm management</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl animate-fade-in">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-fade-in">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-emerald-600">{success}</span>
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.full_name')}
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading || !!success}
                className="input-light"
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>

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
                disabled={loading || !!success}
                className="input-light"
                placeholder={t('auth.enter_email')}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading || !!success}
                  className="input-light pr-12"
                  placeholder={t('auth.create_password')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {password && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {[
                    { key: 'length', label: t('auth.8_chars') },
                    { key: 'uppercase', label: t('auth.uppercase') },
                    { key: 'lowercase', label: t('auth.lowercase') },
                    { key: 'number', label: t('auth.number') },
                  ].map((req) => (
                    <div
                      key={req.key}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        passwordStrength[req.key as keyof typeof passwordStrength]
                          ? 'text-emerald-600'
                          : 'text-gray-400'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                        passwordStrength[req.key as keyof typeof passwordStrength]
                          ? 'bg-emerald-100'
                          : 'bg-gray-100'
                      }`}>
                        {passwordStrength[req.key as keyof typeof passwordStrength] && (
                          <Check className="w-3 h-3" />
                        )}
                      </div>
                      {req.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading || !!success}
                  className="input-light pr-12"
                  placeholder={t('auth.confirm_your_password')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-2">{t('auth.password_requirements')}</p>
              )}
              {confirmPassword && password === confirmPassword && confirmPassword.length >= 8 && (
                <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                  <Check className="w-3 h-3" /> {t('auth.passwords_match')}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="btn-neon w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                  {t('auth.creating_account')}
                </>
              ) : (
                <>
                  {t('auth.sign_up')}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-gray-500">
            {t('auth.already_have_account')}{' '}
            <button
              onClick={onToggle}
              disabled={loading}
              className="text-gray-900 font-semibold hover:underline disabled:opacity-50"
            >
              {t('auth.sign_in')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
