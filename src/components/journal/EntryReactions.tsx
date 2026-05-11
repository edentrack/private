import { useCallback, useEffect, useState } from 'react';
import { Smile } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Reactions strip for a journal entry.
 *
 * Shows aggregate counts per emoji + the current user's selections.
 * Clicking an emoji toggles the user's own reaction (insert OR delete).
 * The "+ react" picker offers a curated emoji list — we keep it small
 * to avoid emoji-paralysis. If you need more, add to ALLOWED_EMOJI.
 *
 * Realtime is opportunistic: we subscribe to `journal_reactions`
 * INSERT/DELETE on this entry_id so other team members' reactions
 * appear without a manual refresh.
 */

const ALLOWED_EMOJI = ['👍', '🎉', '❤️', '🚨', '✅', '👀', '🤔', '🙏'];

interface Reaction {
  emoji: string;
  user_id: string;
}

interface Props {
  entryId: string;
  compact?: boolean;
}

export function EntryReactions({ entryId, compact = false }: Props) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('journal_reactions')
      .select('emoji, user_id')
      .eq('entry_id', entryId);
    setReactions((data as Reaction[] | null) ?? []);
  }, [entryId]);

  useEffect(() => {
    load();
    // Realtime channel: when anyone reacts, update the strip without
    // forcing a page reload. Channel names must be unique per entry
    // so multiple cards don't clobber each other's listeners.
    const channel = supabase
      .channel(`journal_reactions:${entryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'journal_reactions', filter: `entry_id=eq.${entryId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [entryId, load]);

  const toggleReaction = async (emoji: string) => {
    if (!user || busy) return;
    setBusy(true);
    setShowPicker(false);
    const mine = reactions.find(r => r.emoji === emoji && r.user_id === user.id);
    try {
      if (mine) {
        // Optimistic remove
        setReactions(prev => prev.filter(r => !(r.emoji === emoji && r.user_id === user.id)));
        await supabase
          .from('journal_reactions')
          .delete()
          .eq('entry_id', entryId)
          .eq('user_id', user.id)
          .eq('emoji', emoji);
      } else {
        // Optimistic add
        setReactions(prev => [...prev, { emoji, user_id: user.id }]);
        await supabase
          .from('journal_reactions')
          .insert({ entry_id: entryId, user_id: user.id, emoji });
      }
    } finally {
      setBusy(false);
    }
  };

  // Group by emoji for the chip row.
  const grouped: { emoji: string; count: number; mine: boolean }[] = [];
  for (const r of reactions) {
    const existing = grouped.find(g => g.emoji === r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.user_id === user?.id) existing.mine = true;
    } else {
      grouped.push({ emoji: r.emoji, count: 1, mine: r.user_id === user?.id });
    }
  }

  return (
    <div className={`flex items-center flex-wrap gap-1 mt-2 ${compact ? '' : ''}`}>
      {grouped.map(g => (
        <button
          key={g.emoji}
          onClick={() => toggleReaction(g.emoji)}
          disabled={busy}
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
            g.mine
              ? 'bg-[#3D5F42]/10 border-[#3D5F42]/40 text-[#3D5F42]'
              : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          }`}
          title={g.mine ? 'You reacted. Tap to remove.' : `${g.count} reaction${g.count === 1 ? '' : 's'}`}
        >
          <span>{g.emoji}</span>
          <span className="font-semibold">{g.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          onClick={() => setShowPicker(s => !s)}
          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-1"
        >
          <Smile className="w-3 h-3" />
          react
        </button>
        {showPicker && (
          <div className="absolute z-10 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex gap-1">
            {ALLOWED_EMOJI.map(e => (
              <button
                key={e}
                onClick={() => toggleReaction(e)}
                className="text-lg hover:bg-gray-100 rounded p-1"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
