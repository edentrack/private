import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight, Check, Zap, Brain, Wifi, Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_COUNTRIES } from '../../utils/currency';

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
  const [farmName, setFarmName] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [joiningFarmName, setJoiningFarmName] = useState<string | null>(null);

  // Check if user is joining via any invite path (farm join link OR email invite token)
  const isJoiningFarm = !!sessionStorage.getItem('pending_farm_join_id') || !!sessionStorage.getItem('pending_invite_token');

  useEffect(() => {
    const pendingFarmId = sessionStorage.getItem('pending_farm_join_id');
    const pendingSecret = sessionStorage.getItem('pending_farm_join_secret');
    if (!pendingFarmId || !pendingSecret) return;
    supabase.rpc('get_farm_name_by_id', { p_farm_id: pendingFarmId, p_secret: pendingSecret })
      .then(({ data }) => {
        if (data) {
          setJoiningFarmName(data);
        } else {
          sessionStorage.removeItem('pending_farm_join_id');
          sessionStorage.removeItem('pending_farm_join_secret');
          setError('This join link has already been used. Ask the farm owner to share a new one.');
        }
      });
  }, []);

  const validatePassword = () => {
    if (password.length < 8) return 'Password must be at least 8 characters long';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
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

    if (!isJoiningFarm && !farmName.trim()) {
      setError('Please enter your farm name.');
      return;
    }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    const passwordError = validatePassword();
    if (passwordError) { setError(passwordError); return; }

    setLoading(true);
    try {
      const pendingInviteToken = sessionStorage.getItem('pending_invite_token');
      const pendingFarmId = sessionStorage.getItem('pending_farm_join_id');
      const pendingFarmSecret = sessionStorage.getItem('pending_farm_join_secret') || '';

      if (pendingInviteToken || pendingFarmId) {
        // ── Invited worker path ───────────────────────────────────────────
        // Call auto-signup edge function which creates the account with email
        // pre-confirmed and profile set to 'active' — no verification email sent.
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const body: Record<string, string> = { email, password, full_name: fullName };
        if (pendingInviteToken) {
          body.invite_token = pendingInviteToken;
        } else {
          body.farm_join_id = pendingFarmId!;
          body.farm_join_secret = pendingFarmSecret;
        }

        const res = await fetch(`${supabaseUrl}/functions/v1/auto-signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to create account');
        }

        if (data.already_exists) {
          throw new Error('An account with this email already exists. Sign in instead.');
        }

        // Sign in immediately — email is already confirmed
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        // For email invites: navigate to the invite acceptance page so the
        // invite is formally accepted and farm_members row is created.
        if (pendingInviteToken) {
          sessionStorage.removeItem('pending_invite_token');
          window.location.hash = `#/invite/${pendingInviteToken}`;
        }
        // For farm-join: App.tsx useEffect detects pending_farm_join_id and handles it.

      } else {
        // ── New owner path ────────────────────────────────────────────────
        // Save farm details to localStorage so they survive the email-verification
        // redirect (which may open in the same browser tab).
        if (farmName.trim()) {
          localStorage.setItem('pending_farm_name', farmName.trim());
          localStorage.setItem('pending_farm_country', country);
        }
        // If user arrived via a plan CTA (e.g. #/signup?plan=grower), persist it so
        // App.tsx can redirect them straight to the subscribe page after first login.
        const hashQuery = window.location.hash.split('?')[1] || '';
        const planParam = new URLSearchParams(hashQuery).get('plan');
        if (planParam) localStorage.setItem('pending_subscribe_plan', planParam);

        await signUp(email, password, fullName);
        setSuccess('Account created! Check your email and tap the confirmation link to get started.');
      }
    } catch (err: any) {
      localStorage.removeItem('pending_farm_name');
      localStorage.removeItem('pending_farm_country');
      if (err.message?.includes('already registered') || err.message?.includes('User already registered') || err.message?.toLowerCase().includes('already exists')) {
        setError('An account with this email already exists. Sign in instead, or use "Forgot password?" on the sign-in page to reset your password.');
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
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 70% 60% at 30% 50%, rgba(255,221,0,0.06) 0%, transparent 70%)',
        }} />
        <div className="relative">
          <span className="text-3xl font-black tracking-tight">
            <span className="text-white">EDEN</span>
            <span className="neon-track">TRACK</span>
          </span>
        </div>
        <div className="relative space-y-8">
          <div>
            <h2 className="text-4xl font-extrabold text-white leading-tight mb-4 tracking-tight">
              Start your journey<br />
              <span style={{ color: '#ffdd00' }}>to smarter farming</span>
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed max-w-sm">
              Join farmers worldwide who use Edentrack to run their poultry operations like a professional.
            </p>
          </div>
          <div className="space-y-4">
            {[
              { icon: Zap, label: 'Free forever on Starter — no card needed' },
              { icon: Brain, label: 'Eden AI helps you log and diagnose from day one' },
              { icon: Wifi, label: 'Works offline on any smartphone' },
              { icon: CheckCircle, label: 'Set up your farm in under 60 seconds' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-gray-300">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,221,0,0.1)', border: '1px solid rgba(255,221,0,0.2)' }}>
                  <Icon className="w-4 h-4" style={{ color: '#ffdd00' }} />
                </div>
                {label}
              </div>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
            style={{ background: 'rgba(255,221,0,0.08)', border: '1px solid rgba(255,221,0,0.2)', color: '#ffdd00' }}>
            <Zap className="w-4 h-4" />
            Start free, upgrade when ready
          </div>
        </div>
        <div className="relative">
          <p className="text-xs text-gray-600">No credit card required. Cancel anytime.</p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Mobile wordmark */}
          <div className="lg:hidden mb-10 text-center">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-gray-900">EDEN</span>
              <span style={{ color: '#d97706' }}>TRACK</span>
            </span>
          </div>

          {joiningFarmName && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl mb-6">
              <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-green-800">You're joining: {joiningFarmName}</p>
                <p className="text-xs text-green-600 mt-0.5">Create your account below to get started</p>
              </div>
            </div>
          )}

          <h1 className="text-3xl font-extrabold text-gray-900 mb-1 tracking-tight">Create your account</h1>
          <p className="text-gray-400 mb-8 text-sm">
            {joiningFarmName
              ? `You'll be added to ${joiningFarmName} as a worker`
              : isJoiningFarm
              ? "You've been invited — create your account to join the farm instantly"
              : 'Get started — your farm will be ready the moment you verify your email'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-red-600 leading-relaxed">{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-emerald-600">{success}</span>
              </div>
            )}

            {/* Full name */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-semibold text-gray-700 mb-2">
                {t('auth.full_name')}
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading || !!success}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>

            {/* Farm name + country — only for new owners, not for workers joining */}
            {!isJoiningFarm && (
              <>
                <div>
                  <label htmlFor="farmName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Farm Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="farmName"
                    type="text"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    required
                    disabled={loading || !!success}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="e.g., Sunrise Poultry Farm"
                  />
                </div>

                <div>
                  <label htmlFor="country" className="block text-sm font-semibold text-gray-700 mb-2">
                    Country
                  </label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    disabled={loading || !!success}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Email */}
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
                disabled={loading || !!success}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                placeholder={t('auth.enter_email')}
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
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
                  className="w-full h-12 px-4 pr-12 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                  placeholder={t('auth.create_password')}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    <div key={req.key} className={`flex items-center gap-1.5 text-xs transition-colors ${
                      passwordStrength[req.key as keyof typeof passwordStrength] ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                        passwordStrength[req.key as keyof typeof passwordStrength] ? 'bg-emerald-100' : 'bg-gray-100'
                      }`}>
                        {passwordStrength[req.key as keyof typeof passwordStrength] && <Check className="w-2.5 h-2.5" />}
                      </div>
                      {req.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm password
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
                  className="w-full h-12 px-4 pr-12 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50"
                  placeholder={t('auth.confirm_your_password')}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-2">Passwords do not match</p>
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
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-gray-900 transition-all hover:brightness-105 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 mt-2"
              style={{ background: '#ffdd00', boxShadow: '0 4px 16px rgba(255,221,0,0.3)' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                  {t('auth.creating_account')}
                </>
              ) : (
                <>
                  {t('auth.sign_up')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            {t('auth.already_have_account')}{' '}
            <button onClick={onToggle} disabled={loading}
              className="text-gray-900 font-bold hover:underline disabled:opacity-50">
              {t('auth.sign_in')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
