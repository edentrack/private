import { useState } from 'react';
import { Mail, ArrowRight, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

export function WaitingApprovalPage() {
  const { signOut } = useAuth();
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');

  const handleResend = async () => {
    setResendStatus('sending');
    setResendError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setResendStatus('error');
      setResendError('Could not determine your email address. Please sign in again.');
      return;
    }
    const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
    if (error) {
      setResendStatus('error');
      setResendError(error.message);
    } else {
      setResendStatus('sent');
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleBackToLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (signOut) await signOut();
    const base = window.location.pathname || '/';
    window.location.href = base + '#/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-blue-600" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Verify Your Email
          </h1>

          <p className="text-gray-600 mb-6 leading-relaxed">
            We sent a verification link to your email address. Click it to activate your account instantly — no waiting, no manual review.
          </p>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Check your inbox (and spam folder)
                </p>
                <p className="text-sm text-blue-700">
                  The link expires in 24 hours. Once you click it, come back here and your dashboard will be ready.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleRefresh}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              I've verified — open my dashboard
            </button>

            {resendStatus === 'sent' ? (
              <div className="flex items-center justify-center gap-2 text-sm text-green-700 font-medium py-2">
                <CheckCircle className="w-4 h-4" />
                Verification email resent!
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendStatus === 'sending'}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                {resendStatus === 'sending' ? 'Sending…' : 'Resend verification email'}
              </button>
            )}

            {resendStatus === 'error' && (
              <p className="text-sm text-red-600">{resendError}</p>
            )}

            <button
              type="button"
              onClick={handleBackToLogin}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign in with a different account
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
