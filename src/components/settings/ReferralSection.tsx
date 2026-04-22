import { useState, useEffect } from 'react';
import { Gift, Copy, Check, Users, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface ReferralStats {
  total: number;
  rewarded: number;
}

export function ReferralSection() {
  const { profile } = useAuth();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats>({ total: 0, rewarded: 0 });
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    // Load referral code from profile
    supabase
      .from('profiles')
      .select('referral_code')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => setReferralCode(data?.referral_code || null));

    // Load stats
    supabase
      .from('referrals')
      .select('status')
      .eq('referrer_id', profile.id)
      .then(({ data }) => {
        setStats({
          total: data?.length ?? 0,
          rewarded: data?.filter(r => r.status === 'rewarded').length ?? 0,
        });
      });
  }, [profile?.id]);

  const referralLink = referralCode
    ? `${window.location.origin}${window.location.pathname}?ref=${referralCode}`
    : null;

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Referral link copied!');
  };

  const shareLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: 'Join me on Edentrack',
        text: 'I use Edentrack to manage my poultry farm. Use my link to sign up and we both get a free month!',
        url: referralLink,
      });
    } else {
      copyLink();
    }
  };

  const handleApplyCode = async () => {
    if (!applyCode.trim()) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc('apply_referral_code', { p_code: applyCode.trim() });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Referral code applied! Your friend will get credit when you subscribe.');
        setApplyCode('');
      } else {
        toast.error(data?.error || 'Invalid referral code');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply code');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Referral Program</h3>
          <p className="text-sm text-gray-500">Refer a friend — you both get 1 free month when they subscribe</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-0.5">
            <Users className="w-3 h-3" />Friends referred
          </p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{stats.rewarded}</p>
          <p className="text-xs text-amber-600 mt-0.5">Rewards earned</p>
        </div>
      </div>

      {/* Your referral link */}
      {referralCode && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">Your referral code</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-[#3D5F42] tracking-widest">{referralCode}</p>
              <p className="text-xs text-gray-400 truncate">{referralLink}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={copyLink}
                className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                title="Copy link"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
              </button>
              <button
                type="button"
                onClick={shareLink}
                className="p-2 rounded-lg bg-[#3D5F42] text-white hover:bg-[#2F4A34] transition-colors"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Share this code or link with fellow farmers</p>
        </div>
      )}

      {/* Apply a code */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">Have a friend's code?</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={applyCode}
            onChange={e => setApplyCode(e.target.value.toUpperCase())}
            placeholder="Enter code e.g. ABC12345"
            maxLength={10}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3D5F42] uppercase tracking-widest"
          />
          <button
            type="button"
            onClick={handleApplyCode}
            disabled={applying || !applyCode.trim()}
            className="px-4 py-2 bg-[#3D5F42] text-white rounded-xl text-sm font-semibold hover:bg-[#2F4A34] transition-colors disabled:opacity-50"
          >
            {applying ? '…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
