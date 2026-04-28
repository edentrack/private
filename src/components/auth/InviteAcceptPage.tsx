import { useState, useEffect } from 'react';
import { Sprout, AlertCircle, CheckCircle, Loader2, Users, Shield, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface InviteAcceptPageProps {
  token: string;
  onGoToLogin: () => void;
  onGoToSignup: () => void;
  onSuccess: () => void;
}

interface InviteInfo {
  id: string;
  farm_id: string;
  farm_name: string;
  email: string;
  role: string;
  inviter_name: string | null;
  expires_at: string;
}

export function InviteAcceptPage({ token, onGoToLogin, onGoToSignup, onSuccess }: InviteAcceptPageProps) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadInviteInfo();
  }, [token]);

  useEffect(() => {
    if (user && inviteInfo && !success && !accepting) {
      handleAcceptInvite();
    }
  }, [user, inviteInfo]);

  const loadInviteInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      setErrorCode(null);

      const { data, error: rpcError } = await supabase.rpc('get_invitation_by_token', {
        p_token: token
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; error_code?: string; invite?: InviteInfo };

      if (!result.success) {
        setError(result.error || 'Invalid invitation');
        setErrorCode(result.error_code || null);
        return;
      }

      setInviteInfo(result.invite!);
    } catch (err: any) {
      console.error('Error loading invite:', err);
      setError(err.message || 'Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!user || !inviteInfo || accepting) return;

    try {
      setAccepting(true);
      setError(null);

      const userEmail = user.email?.toLowerCase();
      const inviteEmail = inviteInfo.email.toLowerCase();

      if (userEmail !== inviteEmail) {
        setError(`This invitation was sent to ${inviteInfo.email}. You are signed in as ${user.email}. Please sign out and sign in with the correct account.`);
        setAccepting(false);
        return;
      }

      const { data, error: acceptError } = await supabase.rpc('accept_team_invitation', {
        p_token: token
      });

      if (acceptError) throw acceptError;

      const result = data as { success: boolean; error?: string; message?: string; farm_id?: string };

      if (!result.success) {
        setError(result.error || 'Failed to accept invitation');
        return;
      }

      setSuccess(true);

      setTimeout(async () => {
        await onSuccess();
      }, 2000);
    } catch (err: any) {
      console.error('Error accepting invite:', err);
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F5F1E8] flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#3D5F42] mx-auto mb-4" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F1E8] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#3D5F42] rounded-2xl mb-4">
              <Sprout className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Edentrack</h1>
          </div>

          <div className="bg-white rounded-3xl shadow-sm p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {errorCode === 'EXPIRED' ? 'Invitation Expired' :
                 errorCode === 'ALREADY_ACCEPTED' ? 'Already Accepted' :
                 errorCode === 'REVOKED' ? 'Invitation Revoked' :
                 'Invalid Invitation'}
              </h2>
              <p className="text-gray-600 mb-6">{error}</p>

              <button
                onClick={onGoToLogin}
                className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-medium hover:bg-[#2F4A34] transition-colors"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F5F1E8] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#3D5F42] rounded-2xl mb-4">
              <Sprout className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Edentrack</h1>
          </div>

          <div className="bg-white rounded-3xl shadow-sm p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to {inviteInfo?.farm_name}!</h2>
              <p className="text-gray-600 mb-4">
                You have successfully joined the farm as a <strong className="capitalize">{inviteInfo?.role}</strong>.
              </p>
              <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!inviteInfo) return null;

  return (
    <div className="min-h-screen bg-[#F5F1E8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#3D5F42] rounded-2xl mb-4">
            <Sprout className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">EBENEZER FARM</h1>
          <p className="text-gray-600">You've been invited to join a farm</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Join {inviteInfo.farm_name}
            </h2>
            {inviteInfo.inviter_name && (
              <p className="text-gray-600 text-sm mb-4">
                {inviteInfo.inviter_name} has invited you to join their farm
              </p>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-600">You will join as:</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900 capitalize">{inviteInfo.role}</span>
              <span className="text-xs text-gray-500">
                Expires {new Date(inviteInfo.expires_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Invitation for:</strong> {inviteInfo.email}
            </p>
          </div>

          {user ? (
            <div>
              {accepting ? (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-[#3D5F42]" />
                  <span className="text-gray-600">Joining farm...</span>
                </div>
              ) : (
                <button
                  onClick={handleAcceptInvite}
                  className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-medium hover:bg-[#2F4A34] transition-colors flex items-center justify-center gap-2"
                >
                  Accept Invitation
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center mb-4">
                Sign in or create an account to accept this invitation
              </p>
              <button
                onClick={onGoToLogin}
                className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-medium hover:bg-[#2F4A34] transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  try {
                    sessionStorage.setItem('pending_invite_token', token);
                  } catch (_) {}
                  onGoToSignup();
                }}
                className="w-full bg-white text-[#3D5F42] py-3 rounded-xl font-medium border-2 border-[#3D5F42] hover:bg-[#3D5F42]/5 transition-colors"
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
