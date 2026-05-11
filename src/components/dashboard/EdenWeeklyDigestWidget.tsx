import { useCallback, useEffect, useState } from 'react';
import { Sparkles, ChevronRight, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { ChartBlock, type ChartConfig } from '../journal/ChartBlock';

/**
 * Eden Weekly Digest — dashboard tile that mirrors the latest
 * journal weekly_summary entry without making the user open the
 * Journal page. Shows Eden's narrative + the embedded chart.
 *
 * Returns null when there's no recent weekly summary, so dashboards
 * for fresh farms don't render an "Eden is silent" placeholder.
 *
 * Reads directly from journal_entries; no cron of its own. Updates
 * when the user reloads — realtime sub would be overkill for a
 * once-a-week update.
 */

interface WeeklyEntry {
  id: string;
  title: string | null;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function EdenWeeklyDigestWidget() {
  const { currentFarm } = useAuth();
  const [entry, setEntry] = useState<WeeklyEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('journal_entries')
      .select('id, title, body, metadata, created_at')
      .eq('farm_id', currentFarm.id)
      .eq('author_kind', 'eden')
      .eq('entry_type', 'auto_summary')
      .eq('is_deleted', false)
      .filter('metadata->>kind', 'eq', 'weekly_summary')
      .order('created_at', { ascending: false })
      .limit(1);
    const row = (data?.[0] as WeeklyEntry | undefined) ?? null;
    setEntry(row);
    setLoading(false);
  }, [currentFarm?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (!entry) return null;

  const chart = entry.metadata?.chart as ChartConfig | undefined;
  const dateLabel = new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-700" />
          <h3 className="text-sm font-bold text-amber-900">Eden's weekly digest</h3>
          <span className="text-[11px] text-amber-700 italic">· {dateLabel}</span>
        </div>
        <button
          onClick={() => {
            window.location.hash = '#/journal';
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }}
          className="text-[11px] text-amber-800 hover:text-amber-900 inline-flex items-center gap-0.5"
          title="Open Farm Journal"
        >
          <BookOpen className="w-3 h-3" /> Journal <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      {entry.title && (
        <p className="text-base font-semibold text-amber-950 mt-2">{entry.title}</p>
      )}
      <p className="text-sm text-stone-800 mt-1 whitespace-pre-wrap leading-relaxed">{entry.body}</p>
      {chart && (
        <div className="mt-3">
          <ChartBlock config={chart} />
        </div>
      )}
    </div>
  );
}

export default EdenWeeklyDigestWidget;
