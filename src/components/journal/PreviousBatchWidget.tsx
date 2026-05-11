import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Sparkles, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

/**
 * Previous Batch widget — shown at the top of the journal when the
 * current farm has at least one archived flock with `is_carry_forward`
 * entries. Surfaces the lessons the owner curated when archiving the
 * previous flock(s).
 *
 * Collapsible. Defaults to expanded if the user hasn't dismissed it
 * for this farm session (localStorage flag), otherwise collapsed —
 * we don't want the widget to dominate the page once they've read
 * the notes.
 *
 * v1 surfaces the notes inline. v2 will add:
 *   - "Mark as resolved" so a lesson stops re-surfacing once acted on
 *   - "Apply to new flock" copy that drops the note into the current
 *     flock's journal (re-runs through carried_from_flock_id)
 *   - Hide after N days option
 */

interface CarryForwardEntry {
  id: string;
  entry_type: string;
  title: string | null;
  body: string;
  author_kind: 'user' | 'eden' | 'system';
  created_at: string;
  metadata: Record<string, unknown>;
  flock_id: string | null;
  flocks?: { name: string | null } | null;
}

interface Props {
  farmId: string;
  // The current flock id — we surface lessons from PRIOR flocks only,
  // not from the current one's own carry-forward set.
  currentFlockId?: string | null;
}

const COLLAPSED_KEY = (farmId: string) => `eden_prev_batch_collapsed_${farmId}`;

export function PreviousBatchWidget({ farmId, currentFlockId }: Props) {
  const [entries, setEntries] = useState<CarryForwardEntry[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY(farmId)) === 'true';
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    let q = supabase
      .from('journal_entries')
      .select(`
        id, entry_type, title, body, author_kind, created_at, metadata, flock_id,
        flocks!journal_entries_flock_id_fkey (name)
      `)
      .eq('farm_id', farmId)
      .eq('is_carry_forward', true)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(12);
    // Exclude the current flock's own carry-forward set — those are
    // lessons it generated for FUTURE flocks, not for itself.
    if (currentFlockId) q = q.neq('flock_id', currentFlockId);
    const { data, error } = await q;
    if (!error && data) {
      setEntries(data as unknown as CarryForwardEntry[]);
    }
    setLoading(false);
  }, [farmId, currentFlockId]);

  useEffect(() => { load(); }, [load]);

  // Hide entirely if there's nothing to show.
  if (loading || entries.length === 0) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY(farmId), String(next)); } catch { /* nope */ }
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-yellow-50/50 border border-amber-200 rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-3 hover:bg-amber-100/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-700" />
          <span className="text-sm font-bold text-amber-900">
            Lessons from your previous batch{entries.length > 1 ? 'es' : ''}
          </span>
          <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-semibold">
            {entries.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-amber-700" />
        ) : (
          <ChevronUp className="w-4 h-4 text-amber-700" />
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {entries.map(e => {
            const flockName = e.flocks?.name || 'previous flock';
            const isEden = e.author_kind === 'eden';
            return (
              <div
                key={e.id}
                className="bg-white border border-amber-100 rounded-lg p-3"
              >
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500 mb-1">
                  {isEden ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                      <Sparkles className="w-3 h-3" /> Eden
                    </span>
                  ) : (
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  )}
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span className="font-medium text-gray-700">From {flockName}</span>
                  <span>·</span>
                  <span>{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
                {e.title && <p className="font-semibold text-gray-900 text-sm">{e.title}</p>}
                <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap break-words">{e.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
