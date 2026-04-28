import { useEffect, useState } from 'react';
import { X, Info, AlertTriangle, AlertOctagon } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface Broadcast {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  dismissable: boolean;
}

const STYLES = {
  info: {
    bg: 'bg-blue-600',
    text: 'text-white',
    icon: <Info className="w-4 h-4 flex-shrink-0" />,
    btn: 'hover:bg-blue-700',
  },
  warning: {
    bg: 'bg-amber-500',
    text: 'text-gray-900',
    icon: <AlertTriangle className="w-4 h-4 flex-shrink-0" />,
    btn: 'hover:bg-amber-600',
  },
  critical: {
    bg: 'bg-red-600',
    text: 'text-white',
    icon: <AlertOctagon className="w-4 h-4 flex-shrink-0" />,
    btn: 'hover:bg-red-700',
  },
};

export function BroadcastBanner() {
  const { user, profile } = useAuth();
  const [banners, setBanners] = useState<Broadcast[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchBanners();
  }, [user]);

  const fetchBanners = async () => {
    try {
      // Get active broadcasts not yet dismissed by this user
      const { data: broadcasts } = await supabase
        .from('broadcasts')
        .select('id, message, type, dismissable')
        .eq('active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      if (!broadcasts?.length) return;

      const { data: dismissed } = await supabase
        .from('broadcast_dismissals')
        .select('broadcast_id')
        .eq('user_id', user!.id);

      const dismissedIds = new Set((dismissed || []).map(d => d.broadcast_id));

      // Filter by target audience
      const visible = broadcasts.filter(b => {
        if (dismissedIds.has(b.id)) return false;
        return true;
      });

      setBanners(visible as Broadcast[]);
    } catch {
      // Silently ignore — table may not exist yet
    }
  };

  const dismiss = async (id: string, dismissable: boolean) => {
    if (!dismissable) return;
    setBanners(prev => prev.filter(b => b.id !== id));
    try {
      await supabase.from('broadcast_dismissals').insert({ broadcast_id: id, user_id: user!.id });
    } catch {}
  };

  if (!banners.length) return null;

  return (
    <div className="flex flex-col gap-0">
      {banners.map(banner => {
        const s = STYLES[banner.type] || STYLES.info;
        return (
          <div key={banner.id} className={`${s.bg} ${s.text} flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium`}>
            {s.icon}
            <span className="flex-1 text-center leading-snug">{banner.message}</span>
            {banner.dismissable && (
              <button
                type="button"
                onClick={() => dismiss(banner.id, banner.dismissable)}
                className={`ml-2 p-1 rounded-full transition-colors ${s.btn} opacity-80 hover:opacity-100`}
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
