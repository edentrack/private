import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Plus, Pin, Star, Trash2, EyeOff, BookOpen,
  Activity as ActivityIcon, Filter, Search, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AddJournalEntryModal } from './AddJournalEntryModal';
import { EntryReactions } from './EntryReactions';
import { ChartBlock, type ChartConfig } from './ChartBlock';
import { PreviousBatchWidget } from './PreviousBatchWidget';
import type { AuthorRole } from '../../lib/journalLogger';

/**
 * Farm Journal — phase 1 page.
 *
 * Two tabs:
 *   - Activity: auto-generated row per app action (sale, expense,
 *     mortality, etc.). Tappable to deep-link into the underlying
 *     record. Tells the owner who did what without nagging the worker.
 *   - Notes: manual entries by owner/manager/worker, plus Eden's
 *     auto-summaries. Photos + reactions live here in later phases.
 *
 * Filter chips above the timeline narrow by entry_type. Search box
 * does a body-text match server-side. Pinned entries float to the top
 * of their day group.
 *
 * No infinite scroll yet — pulls last 100 rows. Pagination is a
 * follow-up if usage justifies it.
 */

interface JournalEntry {
  id: string;
  farm_id: string;
  flock_id: string | null;
  author_id: string | null;
  author_role: AuthorRole | null;
  author_kind: 'user' | 'eden' | 'system';
  channel: 'activity' | 'notes';
  entry_type: string;
  title: string | null;
  body: string;
  metadata: Record<string, unknown>;
  photo_urls: string[];
  is_pinned: boolean;
  is_private: boolean;
  is_important: boolean;
  created_at: string;
  author?: { full_name: string | null; email: string | null } | null;
}

type TabKey = 'activity' | 'notes' | 'all';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  // notes
  observation: 'Observation', financial: 'Financial', milestone: 'Milestone',
  personal: 'Personal', health: 'Health', auto_summary: 'Eden summary',
  // activity
  sale_logged: 'Sale', expense_logged: 'Expense', feed_logged: 'Feed',
  mortality_logged: 'Mortality', vaccine_logged: 'Vaccine',
  flock_created: 'Flock created', flock_archived: 'Flock archived',
  task_completed: 'Task done', egg_collected: 'Eggs', payment_received: 'Payment',
  team_member_added: 'Team', inventory_added: 'Inventory',
  withdrawal_cleared: 'Withdrawal clear', weight_logged: 'Weight',
  other: 'Other',
};

const ENTRY_TYPE_EMOJI: Record<string, string> = {
  observation: '👀', financial: '💰', milestone: '🏆', personal: '📝',
  health: '🩺', auto_summary: '✨',
  sale_logged: '💵', expense_logged: '🧾', feed_logged: '🌾',
  mortality_logged: '💀', vaccine_logged: '💉', flock_created: '🐣',
  flock_archived: '📦', task_completed: '✅', egg_collected: '🥚',
  payment_received: '💳', team_member_added: '👥', inventory_added: '📦',
  withdrawal_cleared: '✅', weight_logged: '⚖️', other: '•',
};

export function JournalPage() {
  const { currentFarm, profile, currentRole } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>('activity');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);

  const farmId = currentFarm?.id;
  const isOwner = currentRole === 'owner';

  const loadEntries = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      let q = supabase
        .from('journal_entries')
        .select(`
          id, farm_id, flock_id, author_id, author_role, author_kind, channel,
          entry_type, title, body, metadata, photo_urls, is_pinned, is_private,
          is_important, created_at,
          author:profiles!journal_entries_author_id_fkey (full_name, email)
        `)
        .eq('farm_id', farmId)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (tab !== 'all') q = q.eq('channel', tab);
      if (filterType) q = q.eq('entry_type', filterType);
      if (searchTerm.trim()) q = q.ilike('body', `%${searchTerm.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      setEntries((data as unknown as JournalEntry[]) ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load journal');
    } finally {
      setLoading(false);
    }
  }, [farmId, tab, filterType, searchTerm, toast]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const togglePin = async (entry: JournalEntry) => {
    if (!isOwner && entry.author_id !== profile?.id) {
      toast.error('Only the author or farm owner can pin');
      return;
    }
    const { error } = await supabase
      .from('journal_entries')
      .update({ is_pinned: !entry.is_pinned })
      .eq('id', entry.id);
    if (error) toast.error('Pin failed');
    else loadEntries();
  };

  const toggleImportant = async (entry: JournalEntry) => {
    if (!isOwner) {
      toast.error('Only the farm owner can flag as important');
      return;
    }
    const { error } = await supabase
      .from('journal_entries')
      .update({ is_important: !entry.is_important })
      .eq('id', entry.id);
    if (error) toast.error('Update failed');
    else loadEntries();
  };

  const softDelete = async (entry: JournalEntry) => {
    if (!isOwner && entry.author_id !== profile?.id) {
      toast.error('Only the author or farm owner can delete');
      return;
    }
    if (!confirm('Hide this entry from the journal? The underlying record (sale, expense, etc.) stays in place.')) return;
    const { error } = await supabase
      .from('journal_entries')
      .update({ is_deleted: true })
      .eq('id', entry.id);
    if (error) toast.error('Delete failed');
    else loadEntries();
  };

  // Group by day for the timeline header. ISO date string (YYYY-MM-DD)
  // in the user's locale is the cleanest grouping key.
  const grouped = useMemo(() => {
    const buckets: Record<string, JournalEntry[]> = {};
    entries.forEach(e => {
      const day = new Date(e.created_at).toLocaleDateString('en-CA');
      (buckets[day] = buckets[day] ?? []).push(e);
    });
    return Object.entries(buckets).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [entries]);

  if (!farmId) {
    return (
      <div className="text-center py-16 text-gray-500">
        Select a farm to view its journal.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#3D5F42]" />
            Farm Journal
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Every action, every note, every milestone. One timeline per farm.
          </p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 bg-[#3D5F42] text-white px-4 py-2.5 rounded-xl hover:bg-[#2F4A34] transition-colors text-sm font-semibold shadow"
        >
          <Plus className="w-4 h-4" />
          Write a note
        </button>
      </div>

      {/* Previous Batch lessons — shows carry-forward notes from any
          earlier archived flock(s) on this farm so the owner walks
          into a new batch with the lessons from the last one already
          surfaced. Collapsible, auto-hidden when empty. */}
      <PreviousBatchWidget farmId={farmId} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([
          { key: 'activity', label: 'Activity', icon: ActivityIcon },
          { key: 'notes', label: 'Notes', icon: BookOpen },
          { key: 'all', label: 'All', icon: Sparkles },
        ] as const).map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setFilterType(null); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                active
                  ? 'border-[#3D5F42] text-[#3D5F42]'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search + filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search the journal..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
          />
        </div>
        {filterType && (
          <button
            onClick={() => setFilterType(null)}
            className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1.5 rounded-full font-medium flex items-center gap-1"
          >
            <Filter className="w-3 h-3" />
            {ENTRY_TYPE_LABELS[filterType]} ×
          </button>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState tab={tab} onCompose={() => setShowCompose(true)} />
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, dayEntries]) => (
            <div key={day} className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {formatDayLabel(day)}
              </div>
              {dayEntries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  isOwner={isOwner}
                  selfId={profile?.id ?? null}
                  onPin={() => togglePin(entry)}
                  onImportant={() => toggleImportant(entry)}
                  onDelete={() => softDelete(entry)}
                  onFilterType={(t) => setFilterType(t)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {showCompose && (
        <AddJournalEntryModal
          farmId={farmId}
          onClose={() => setShowCompose(false)}
          onSaved={() => { setShowCompose(false); loadEntries(); }}
        />
      )}
    </div>
  );
}

function EmptyState({ tab, onCompose }: { tab: TabKey; onCompose: () => void }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">
        {tab === 'activity' && 'No activity yet'}
        {tab === 'notes' && 'No notes yet'}
        {tab === 'all' && 'Your journal is empty'}
      </p>
      <p className="text-sm mt-1">
        {tab === 'activity'
          ? 'Activity entries appear automatically when you log sales, expenses, mortality, feed, and more.'
          : 'Capture observations, milestones, and notes that don\'t fit in a form.'}
      </p>
      {tab !== 'activity' && (
        <button
          onClick={onCompose}
          className="mt-4 inline-flex items-center gap-2 bg-[#3D5F42] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#2F4A34]"
        >
          <Plus className="w-4 h-4" /> Write the first note
        </button>
      )}
    </div>
  );
}

function EntryCard({
  entry, isOwner, selfId, onPin, onImportant, onDelete, onFilterType,
}: {
  entry: JournalEntry;
  isOwner: boolean;
  selfId: string | null;
  onPin: () => void;
  onImportant: () => void;
  onDelete: () => void;
  onFilterType: (t: string) => void;
}) {
  const time = new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const canEdit = isOwner || entry.author_id === selfId;
  const authorName =
    entry.author_kind === 'eden'
      ? 'Eden'
      : entry.author_kind === 'system'
      ? entry.author?.full_name || 'Someone'
      : entry.author?.full_name || entry.author?.email?.split('@')[0] || 'Someone';

  const authorChip =
    entry.author_kind === 'eden' ? null : entry.author_role;

  return (
    <div
      className={`bg-white border rounded-xl p-4 ${entry.is_important ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'} ${entry.is_pinned ? 'ring-1 ring-[#3D5F42]/30' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Author / type icon */}
        <div className="text-xl flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-50">
          {entry.author_kind === 'eden' ? '✨' : ENTRY_TYPE_EMOJI[entry.entry_type] ?? '•'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
            <span className={`font-semibold ${entry.author_kind === 'eden' ? 'text-[#d97706]' : 'text-gray-900'}`}>
              {authorName}
            </span>
            {authorChip && (
              <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {authorChip}
              </span>
            )}
            <span>·</span>
            <span>{time}</span>
            <button
              onClick={() => onFilterType(entry.entry_type)}
              className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded transition-colors"
            >
              {ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type}
            </button>
            {entry.is_private && (
              <span className="text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded flex items-center gap-1">
                <EyeOff className="w-2.5 h-2.5" /> Private
              </span>
            )}
            {entry.is_pinned && <Pin className="w-3 h-3 text-[#3D5F42]" />}
            {entry.is_important && <Star className="w-3 h-3 text-amber-600 fill-amber-600" />}
          </div>

          {entry.title && <p className="font-semibold text-gray-900 mt-1">{entry.title}</p>}
          <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap break-words">{entry.body}</p>

          {entry.photo_urls.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {entry.photo_urls.slice(0, 6).map((url, i) => (
                <img key={i} src={url} alt="" className="w-full h-20 object-cover rounded-md border border-gray-100" />
              ))}
            </div>
          )}

          {/* Inline chart — Eden emits one in metadata.chart for the
              weekly summary (sparkline of daily eggs) and cycle close-
              out (3-bar P&L). Component is null-safe if shape mismatches. */}
          {entry.metadata?.chart != null && (
            <ChartBlock config={entry.metadata.chart as ChartConfig} />
          )}

          {/* Deep-link to the underlying record for activity rows.
              Maps linked_table to the right hash route. Fallbacks to
              page-level views for tables without a per-row detail page. */}
          {entry.channel === 'activity' && entry.metadata?.linked_table != null && (
            <button
              className="mt-2 text-xs text-[#3D5F42] hover:underline inline-flex items-center gap-1"
              onClick={() => deepLinkToRecord(entry)}
            >
              View record <ChevronRight className="w-3 h-3" />
            </button>
          )}

          {/* Reactions strip — phase 2. Hidden on Eden's auto rows
              and on system-only rows for now, but kept on user-written
              notes and on activity rows so the owner can 👍 a worker's
              well-handled mortality entry. */}
          <EntryReactions entryId={entry.id} />


          {/* Actions row */}
          {canEdit && (
            <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
              <button onClick={onPin} className="hover:text-[#3D5F42] flex items-center gap-1">
                <Pin className="w-3 h-3" />
                {entry.is_pinned ? 'Unpin' : 'Pin'}
              </button>
              {isOwner && (
                <button onClick={onImportant} className="hover:text-amber-600 flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  {entry.is_important ? 'Clear important' : 'Mark important'}
                </button>
              )}
              <button onClick={onDelete} className="hover:text-red-600 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Hide
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Take an activity entry's linked_table and navigate to the most
 * useful surface in-app. The journal stores the linked row's id so
 * future detail pages can scroll to / highlight it; for now we drop
 * the user on the relevant list page where they can find the row.
 */
function deepLinkToRecord(entry: JournalEntry) {
  const table = entry.metadata?.linked_table as string | undefined;
  const hashByTable: Record<string, string> = {
    bird_sales: '#/sales',
    egg_sales: '#/sales',
    expenses: '#/expenses',
    feed_stock: '#/inventory',
    feed_inventory: '#/inventory',
    other_inventory: '#/inventory',
    egg_collections: '#/egg-records',
    mortality_logs: '#/mortality',
    vet_logs: '#/vet-log',
    weight_logs: '#/weight',
    tasks: '#/tasks',
    flocks: entry.flock_id ? '#/flocks' : '#/flocks',
    farm_members: '#/team',
  };
  const target = table ? hashByTable[table] : null;
  if (target) {
    window.location.hash = target;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    console.warn('[journal] No deep-link defined for table:', table);
  }
}

function formatDayLabel(isoDay: string): string {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  if (isoDay === today) return 'Today';
  if (isoDay === yesterday) return 'Yesterday';
  return new Date(isoDay).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default JournalPage;
