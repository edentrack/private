import { useState, useEffect } from 'react';
import { Link2, Copy, Check, Share2, Users, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

export function FarmJoinCodeSection() {
  const { currentFarm } = useAuth();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSecret = async () => {
    if (!currentFarm?.id) return;
    const { data } = await supabase
      .from('farms')
      .select('join_secret')
      .eq('id', currentFarm.id)
      .single();
    if (data?.join_secret) setSecret(data.join_secret);
  };

  useEffect(() => { fetchSecret(); }, [currentFarm?.id]);

  const refreshLink = async () => {
    if (!currentFarm?.id || refreshing) return;
    setRefreshing(true);
    await supabase
      .from('farms')
      .update({ join_secret: null })
      .eq('id', currentFarm.id);
    await fetchSecret();
    setRefreshing(false);
    showToast('Fresh link generated', 'success');
  };

  if (!currentFarm?.id || !secret) return null;

  const joinLink = `${window.location.origin}${window.location.pathname}#/join/${currentFarm.id}/${secret}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Join link copied!', 'success');
  };

  const shareLink = async () => {
    const text = `Join my farm "${currentFarm.name}" on Edentrack — tap the link to create your account:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${currentFarm.name} on Edentrack`, text, url: joinLink });
        return;
      } catch {}
    }
    copyLink();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-3 bg-[#3D5F42]/5 border border-[#3D5F42]/20 rounded-xl">
        <Users className="w-4 h-4 text-[#3D5F42] mt-0.5 shrink-0" />
        <p className="text-xs text-gray-600">
          Share this link with one worker at a time. After they join, the link automatically changes — forward it to someone else won't work.
        </p>
      </div>

      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
        <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
        <p className="flex-1 text-xs text-gray-500 truncate font-mono">{joinLink}</p>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={refreshLink}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Generate a new link"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={copyLink}
            className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Copy link"
          >
            {copied
              ? <Check className="w-3.5 h-3.5 text-green-500" />
              : <Copy className="w-3.5 h-3.5 text-gray-500" />}
          </button>
          <button
            onClick={shareLink}
            className="p-1.5 rounded-lg bg-[#3D5F42] text-white hover:bg-[#2F4A34] transition-colors"
            title="Share"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Everyone joins as a <strong>worker</strong>. Promote to manager in Team Management afterward.
        Use the <RefreshCw className="inline w-3 h-3" /> button to generate a new link at any time.
      </p>
    </div>
  );
}
