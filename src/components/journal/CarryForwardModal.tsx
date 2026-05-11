import { useCallback, useEffect, useState } from 'react';
import { X, Check, ArrowRight, Star, Pin, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

/**
 * Curate-forward modal.
 *
 * Shown when an owner is about to archive a flock. Loads every
 * journal_entries row for that flock and pre-checks the ones likely
 * to be useful for the next batch:
 *
 *   - All `is_important` entries (owner already flagged them)
 *   - All `is_pinned` entries (owner already pinned them)
 *   - Eden's milestone entries (cycle close-out auto-summary)
 *   - Health entries (vet visits with diagnoses)
 *
 * Owner can uncheck what they don't want, OR check additional entries
 * (a one-liner observation that ended up mattering). On Save, the
 * selected entries get `is_carry_forward = true`.
 *
 * The actual flock archive happens BEFORE this modal opens — the
 * flock-archived trigger has already fired and posted the Eden
 * cycle close-out. This modal is purely about curating which notes
 * persist into future batches.
 *
 * Closing without saving = nothing carries forward.
 */

interface JournalEntry {
  id: string;
  channel: 'activity' | 'notes';
  entry_type: string;
  title: string | null;
  body: string;
  is_pinned: boolean;
  is_important: boolean;
  author_kind: 'user' | 'eden' | 'system';
  created_at: string;
  metadata: Record<string, unknown>;
}

interface Props {
  flockId: string;
  flockName: string;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  observation: 'Observation', financial: 'Financial', milestone: 'Milestone',
  personal: 'Personal', health: 'Health', auto_summary: 'Eden summary',
  sale_logged: 'Sale', expense_logged: 'Expense', feed_logged: 'Feed',
  mortality_logged: 'Mortality', vaccine_logged: 'Vaccine',
  weight_logged: 'Weight', flock_created: 'Flock created',
  task_completed: 'Task done', egg_collected: 'Eggs',
};

export function CarryForwardModal({ flockId, flockName, onClose, onSaved }: Props) {
  const toast = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /**
   * Pull every entry for this flock. We pre-check the ones the owner
   * is most likely to want: important, pinned, milestones, vet
   * health entries. Everything else starts unchecked so the owner
   * makes an explicit choice for routine activity rows.
   */
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, channel, entry_type, title, body, is_pinned, is_important, author_kind, created_at, metadata')
      .eq('flock_id', flockId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Could not load journal entries');
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as JournalEntry[];
    setEntries(rows);
    const preselected = new Set<string>();
    for (const e of rows) {
      if (e.is_important) preselected.add(e.id);
      else if (e.is_pinned) preselected.add(e.id);
      else if (e.entry_type === 'milestone') preselected.add(e.id);
      else if (e.entry_type === 'health' && e.body) preselected.add(e.id);
      else if (e.author_kind === 'eden' && e.entry_type === 'auto_summary') preselected.add(e.id);
    }
    setSelected(preselected);
    setLoading(false);
  }, [flockId, toast]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Mark the chosen entries with is_carry_forward=true. We also clear
   * any existing carry-forward flags on this flock that the owner
   * un-selected — so toggling Off in the picker actually means Off,
   * not "stays from before".
   */
  const handleSave = async () => {
    setSaving(true);
    try {
      const ids = Array.from(selected);
      // Two updates: set is_carry_forward=true for selected, false for
      // anything previously true on this flock that the owner
      // un-checked. Sequential so the type system sees real awaits.
      if (ids.length > 0) {
        await supabase
          .from('journal_entries')
          .update({ is_carry_forward: true })
          .in('id', ids);
      }
      // Build a "not in selected" clause. PostgREST's .not('id', 'in', ...)
      // needs a parenthesised list; an empty list becomes `("")` which
      // matches nothing (acceptable — means "unset everything").
      const notInClause = ids.length > 0
        ? `(${ids.map(i => `"${i}"`).join(',')})`
        : `("")`;
      await supabase
        .from('journal_entries')
        .update({ is_carry_forward: false })
        .eq('flock_id', flockId)
        .eq('is_carry_forward', true)
        .not('id', 'in', notInClause);
      toast.success(`${ids.length} note${ids.length === 1 ? '' : 's'} will carry forward to your next batch`);
      onSaved();
    } catch (err) {
      console.warn('[CarryForward] save failed:', err);
      toast.error('Could not save the curated list');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-4 border-b sticky top-0 bg-white">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-[#3D5F42]" />
              Carry notes forward
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Pick which lessons from <span className="font-semibold">{flockName}</span> should travel to your next batch. You can change this later.
            </p>
          </div>
          <button onClick={onClose} className="flex-shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading journal…
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium">No journal entries on this flock yet.</p>
              <p className="text-sm mt-1">Nothing to carry forward.</p>
            </div>
          ) : (
            entries.map(e => {
              const isSelected = selected.has(e.id);
              const preview = e.body.length > 140 ? `${e.body.slice(0, 140)}…` : e.body;
              return (
                <label
                  key={e.id}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-[#3D5F42] bg-[#3D5F42]/5'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(e.id)}
                    className="mt-1 w-4 h-4 accent-[#3D5F42]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
                      <span className="font-semibold uppercase tracking-wide">
                        {TYPE_LABEL[e.entry_type] ?? e.entry_type}
                      </span>
                      {e.author_kind === 'eden' && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Sparkles className="w-3 h-3" /> Eden
                        </span>
                      )}
                      {e.is_pinned && <Pin className="w-3 h-3 text-[#3D5F42]" />}
                      {e.is_important && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      <span>·</span>
                      <span>{new Date(e.created_at).toLocaleDateString()}</span>
                    </div>
                    {e.title && <p className="font-semibold text-gray-900 mt-0.5">{e.title}</p>}
                    <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap break-words">{preview}</p>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-600">
            {selected.size} of {entries.length} selected
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-white disabled:opacity-50"
            >
              Skip
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 bg-[#3D5F42] text-white rounded-lg text-sm font-semibold hover:bg-[#2F4A34] disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Carry forward
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
