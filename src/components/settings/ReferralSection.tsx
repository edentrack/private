import { useState, useEffect } from 'react';
import { Gift, Copy, Check, Users, Share2, Pencil, X, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface ReferralStats {
  total: number;
  rewarded: number;
}

export function ReferralSection() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats>({ total: 0, rewarded: 0 });
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [editsRemaining, setEditsRemaining] = useState<number>(2);

  // edit mode
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('profiles')
      .select('referral_code, referral_code_edits')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => {
        setReferralCode(data?.referral_code || null);
        setEditsRemaining(Math.max(0, 2 - (data?.referral_code_edits ?? 0)));
      });

    supabase
      .from('referrals')
      .select('status')
      .eq('referrer_id', profile.id)
      .then(({ data }) => setStats({
        total: data?.length ?? 0,
        rewarded: data?.filter(r => r.status === 'rewarded').length ?? 0,
      }));
  }, [profile?.id]);

  const referralLink = referralCode
    ? `${window.location.origin}${window.location.pathname}?ref=${referralCode}`
    : null;

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Referral link copied!', 'success');
  };

  const shareLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: 'Join me on Edentrack',
        text: `I use Edentrack to manage my poultry farm — we both get a free month when you subscribe! Use my code: ${referralCode}`,
        url: referralLink,
      });
    } else {
      copyLink();
    }
  };

  const startEdit = () => {
    setEditValue(referralCode || '');
    setEditError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError('');
  };

  const handleEditChange = (val: string) => {
    // Allow only letters, numbers, hyphen — uppercase live
    const clean = val.toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 15);
    setEditValue(clean);
    setEditError('');
  };

  const saveCode = async () => {
    const trimmed = editValue.trim();
    if (trimmed.length < 4) {
      setEditError('At least 4 characters required');
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      const { data, error } = await supabase.rpc('update_referral_code', { p_new_code: trimmed });
      if (error) throw error;
      if (!data?.ok) {
        setEditError(data?.error || 'Could not save code');
        return;
      }
      setReferralCode(data.code);
      setEditsRemaining(data.edits_remaining ?? 0);
      setEditing(false);
      showToast('Referral code updated!', 'success');
    } catch (e: any) {
      setEditError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyCode = async () => {
    if (!applyCode.trim()) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc('apply_referral_code', { p_code: applyCode.trim() });
      if (error) throw error;
      if (data?.ok) {
        showToast('Code applied! Your friend gets rewarded when you make your first payment.', 'success');
        setApplyCode('');
      } else {
        showToast(data?.error || 'Invalid referral code', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to apply code', 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Referral Program</h3>
          <p className="text-sm text-gray-500">
            Refer a friend — you <strong>both get 1 free month</strong> when they make their first payment
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-0.5">
            <Users className="w-3 h-3" /> Friends referred
          </p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{stats.rewarded}</p>
          <p className="text-xs text-amber-600 mt-0.5">Free months earned</p>
        </div>
      </div>

      {/* Referral code + edit */}
      {referralCode && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">Your referral code</p>
            {!editing && editsRemaining > 0 && (
              <button
                onClick={startEdit}
                className="flex items-center gap-1 text-xs text-[#3D5F42] hover:underline font-medium"
              >
                <Pencil className="w-3 h-3" />
                Customise ({editsRemaining} edit{editsRemaining !== 1 ? 's' : ''} left)
              </button>
            )}
            {!editing && editsRemaining === 0 && (
              <span className="text-xs text-gray-400">No edits remaining</span>
            )}
          </div>

          {editing ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={editValue}
                  onChange={e => handleEditChange(e.target.value)}
                  maxLength={15}
                  placeholder="e.g. SUNRISEFARM"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 text-sm font-mono tracking-widest uppercase focus:outline-none focus:border-[#3D5F42] focus:ring-2 focus:ring-[#3D5F42]/10"
                  autoFocus
                />
                <button
                  onClick={saveCode}
                  disabled={saving || editValue.trim().length < 4}
                  className="px-4 py-2 rounded-xl bg-[#3D5F42] text-white text-sm font-semibold hover:bg-[#2F4A34] disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {editError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <X className="w-3 h-3" /> {editError}
                </p>
              )}
              <p className="text-xs text-gray-400">
                Letters, numbers and hyphens only · 4–15 characters · will be UPPERCASED
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-[#3D5F42] tracking-widest font-mono">{referralCode}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{referralLink}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={copyLink}
                  className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                  title="Copy link"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
                </button>
                <button
                  onClick={shareLink}
                  className="p-2 rounded-lg bg-[#3D5F42] text-white hover:bg-[#2F4A34]"
                  title="Share"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1.5">
            Share this code or link — reward is credited when your friend pays for their first plan
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1.5">
        <p className="text-xs font-semibold text-amber-800">How it works</p>
        <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
          <li>Share your code or link with another farmer</li>
          <li>They sign up and enter your code</li>
          <li>When they pay for their first plan, <strong>you both get 1 month free</strong> added to your subscription</li>
        </ol>
      </div>

      {/* Apply a code */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">Have a friend's code?</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={applyCode}
            onChange={e => setApplyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, ''))}
            placeholder="Enter code e.g. SUNRISEFARM"
            maxLength={15}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#3D5F42] uppercase tracking-widest font-mono"
          />
          <button
            onClick={handleApplyCode}
            disabled={applying || !applyCode.trim()}
            className="px-4 py-2 bg-[#3D5F42] text-white rounded-xl text-sm font-semibold hover:bg-[#2F4A34] disabled:opacity-50"
          >
            {applying ? '…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
