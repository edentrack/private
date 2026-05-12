import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Paperclip, Star, Trash2, EyeOff, Sparkles,
  Search, Download, FileText, ChevronRight, Calendar, X as XIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { AddJournalEntryModal } from './AddJournalEntryModal';
import { EntryReactions } from './EntryReactions';
import { ChartBlock, type ChartConfig } from './ChartBlock';
import { PreviousBatchWidget } from './PreviousBatchWidget';
import { exportJournalToPdf } from './journalPdfExport';
import type { AuthorRole } from '../../lib/journalLogger';

/**
 * Farm Journal — notebook redesign.
 *
 * Visual model: a real ruled notebook page. Cream background, faint
 * horizontal rule lines, date stamps as page headers, entries flow
 * as paragraphs rather than data-grid cards. Metadata chips are
 * pushed below the body or replaced with small inline indicators
 * (paperclip for pinned, star for important, sparkle for Eden).
 *
 * Why this shift: the previous design read like a spreadsheet of
 * facts. Farmers asked for "lines and stuff like that" — the
 * journal-as-diary feel where reading 50 entries in a row doesn't
 * feel like processing a database. Same content, gentler chrome.
 *
 * Two channels still:
 *   - Activity (auto-logged from app actions)
 *   - Notes (manual + Eden + weekly summaries)
 *
 * Filter chips above the timeline narrow by entry_type. Search box
 * does a body-text match server-side. Pinned entries float to the
 * top of their day group.
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
  /**
   * When the event actually happened (user-editable, defaults to
   * created_at for legacy rows). All date grouping + filtering reads
   * this column. created_at is preserved for audit only.
   */
  occurred_at: string;
  author?: { full_name: string | null; email: string | null } | null;
}

type TabKey = 'activity' | 'notes' | 'all';

/**
 * Date-range presets for the journal filter. "All" = no bound. The
 * custom range opens two date pickers. The defaults below match the
 * way farmers actually navigate their journals — most just want
 * "today", "this week", or "everything".
 */
type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

function rangeBounds(preset: DateRangePreset, customFrom: string, customTo: string): { gte?: string; lte?: string } {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { gte: start.toISOString(), lte: end.toISOString() };
  }
  if (preset === 'week') {
    // Last 7 days, inclusive of today.
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
    return { gte: start.toISOString() };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return { gte: start.toISOString() };
  }
  if (preset === 'custom') {
    const out: { gte?: string; lte?: string } = {};
    if (customFrom) {
      const [y, m, d] = customFrom.split('-').map(n => parseInt(n, 10));
      if (y && m && d) out.gte = new Date(y, m - 1, d, 0, 0, 0).toISOString();
    }
    if (customTo) {
      const [y, m, d] = customTo.split('-').map(n => parseInt(n, 10));
      if (y && m && d) out.lte = new Date(y, m - 1, d, 23, 59, 59).toISOString();
    }
    return out;
  }
  return {};
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  observation: 'Observation', financial: 'Financial', milestone: 'Milestone',
  personal: 'Personal', health: 'Health', auto_summary: 'Eden summary',
  sale_logged: 'Sale', expense_logged: 'Expense', feed_logged: 'Feed',
  mortality_logged: 'Mortality', vaccine_logged: 'Vaccine',
  flock_created: 'Flock created', flock_archived: 'Flock archived',
  task_completed: 'Task done', egg_collected: 'Eggs', payment_received: 'Payment',
  team_member_added: 'Team', inventory_added: 'Inventory',
  withdrawal_cleared: 'Withdrawal clear', weight_logged: 'Weight',
  other: 'Other',
};

export function JournalPage() {
  const { currentFarm, profile, currentRole } = useAuth();
  const toast = useToast();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [tab, setTab] = useState<TabKey>('all');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Date-range filter state. Default is 'all' so the journal still
  // opens with the full history visible — same as before this
  // feature landed. The custom-from/to pair only matters when
  // dateRange === 'custom'.
  const [dateRange, setDateRange] = useState<DateRangePreset>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const farmId = currentFarm?.id;
  const farmName = currentFarm?.name ?? 'My Farm';
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
          is_important, created_at, occurred_at,
          author:profiles!journal_entries_author_id_fkey (full_name, email)
        `)
        .eq('farm_id', farmId)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (tab !== 'all') q = q.eq('channel', tab);
      if (filterType) q = q.eq('entry_type', filterType);
      if (searchTerm.trim()) q = q.ilike('body', `%${searchTerm.trim()}%`);
      // Date-range filter. We bound on occurred_at because that's the
      // event date, not the audit timestamp. "Today" = events today.
      const bounds = rangeBounds(dateRange, customFrom, customTo);
      if (bounds.gte) q = q.gte('occurred_at', bounds.gte);
      if (bounds.lte) q = q.lte('occurred_at', bounds.lte);
      const { data, error } = await q;
      if (error) throw error;
      setEntries((data as unknown as JournalEntry[]) ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isFr ? 'Impossible de charger le journal' : 'Could not load journal'));
    } finally {
      setLoading(false);
    }
  }, [farmId, tab, filterType, searchTerm, dateRange, customFrom, customTo, toast]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const togglePin = async (entry: JournalEntry) => {
    if (!isOwner && entry.author_id !== profile?.id) {
      toast.error(isFr ? 'Seul l\'auteur ou le propriétaire de la ferme peut épingler' : 'Only the author or farm owner can pin');
      return;
    }
    const { error } = await supabase
      .from('journal_entries')
      .update({ is_pinned: !entry.is_pinned })
      .eq('id', entry.id);
    if (error) toast.error(isFr ? 'Échec de l\'épinglage' : 'Pin failed');
    else loadEntries();
  };

  const toggleImportant = async (entry: JournalEntry) => {
    if (!isOwner) {
      toast.error(isFr ? 'Seul le propriétaire peut marquer comme important' : 'Only the farm owner can flag as important');
      return;
    }
    const { error } = await supabase
      .from('journal_entries')
      .update({ is_important: !entry.is_important })
      .eq('id', entry.id);
    if (error) toast.error(isFr ? 'Échec de la mise à jour' : 'Update failed');
    else loadEntries();
  };

  const softDelete = async (entry: JournalEntry) => {
    if (!isOwner && entry.author_id !== profile?.id) {
      toast.error(isFr ? 'Seul l\'auteur ou le propriétaire peut supprimer' : 'Only the author or farm owner can delete');
      return;
    }
    if (!confirm(isFr
      ? 'Masquer cette entrée du journal ? La donnée d\'origine reste en place.'
      : 'Hide this entry from the journal? The underlying record stays in place.')) return;
    const { error } = await supabase
      .from('journal_entries')
      .update({ is_deleted: true })
      .eq('id', entry.id);
    if (error) toast.error(isFr ? 'Échec de la suppression' : 'Delete failed');
    else loadEntries();
  };

  const handleExport = async (range: 'week' | 'month') => {
    if (!entries.length) {
      toast.error(isFr ? 'Rien à exporter pour le moment' : 'Nothing to export yet');
      return;
    }
    setExporting(true);
    try {
      await exportJournalToPdf({
        farmName,
        entries: entries.map(e => ({
          ...e,
          authorName: e.author_kind === 'eden'
            ? 'Eden'
            : e.author?.full_name || e.author?.email?.split('@')[0] || (isFr ? 'Quelqu\'un' : 'Someone'),
        })),
        range,
      });
      toast.success(isFr
        ? `Journal ${range === 'week' ? 'de la semaine' : 'du mois'} exporté`
        : `Exported ${range === 'week' ? 'this week' : 'this month'}'s journal`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (isFr ? 'Échec de l\'export' : 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  // Group by day for the page-header style date stamps. Bucket by
  // occurred_at (the event date) so backdated entries sort under the
  // correct page header, not under the day they were written.
  const grouped = useMemo(() => {
    const buckets: Record<string, JournalEntry[]> = {};
    entries.forEach(e => {
      const day = new Date(e.occurred_at ?? e.created_at).toLocaleDateString('en-CA');
      (buckets[day] = buckets[day] ?? []).push(e);
    });
    return Object.entries(buckets).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [entries]);

  if (!farmId) {
    return (
      <div className="text-center py-16 text-gray-500">
        {isFr ? 'Sélectionnez une ferme pour voir son journal.' : 'Select a farm to view its journal.'}
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header — neutral on top of the notebook page */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
            {isFr ? 'Journal de la ferme' : 'Farm Journal'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5 italic">
            {isFr ? 'Notes, jalons et quotidien de votre ferme.' : 'Notes, milestones, and the day-to-day of your farm.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('week')}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#3D5F42] px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            title={isFr ? 'Exporter le journal de la semaine en PDF' : "Export this week's journal to PDF"}
          >
            <Download className="w-4 h-4" />
            {isFr ? 'Semaine' : 'Week'}
          </button>
          <button
            onClick={() => handleExport('month')}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#3D5F42] px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            title={isFr ? 'Exporter le journal du mois en PDF' : "Export this month's journal to PDF"}
          >
            <FileText className="w-4 h-4" />
            {isFr ? 'Mois' : 'Month'}
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 bg-[#3D5F42] text-white px-4 py-2 rounded-lg hover:bg-[#2F4A34] transition-colors text-sm font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {isFr ? 'Nouvelle entrée' : 'New entry'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <PreviousBatchWidget farmId={farmId} />

        {/* Tabs as paper section dividers — Activity/Notes/All */}
        <div className="flex items-center gap-1">
          {([
            { key: 'all',      label: isFr ? 'Tout'      : 'All' },
            { key: 'notes',    label: isFr ? 'Notes'     : 'Notes' },
            { key: 'activity', label: isFr ? 'Activité'  : 'Activity' },
          ] as const).map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setFilterType(null); }}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                  active
                    ? 'bg-[#3D5F42] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isFr ? 'Rechercher...' : 'Search...'}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
            />
          </div>
        </div>

        {/* Date-range filter row. Five preset buttons + a custom
            range. Defaults to All so the journal opens with full
            history. Custom opens two date inputs underneath. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-gray-500 font-semibold pr-1">
            <Calendar className="w-3.5 h-3.5" /> {isFr ? 'Date' : 'Date'}
          </span>
          {([
            { key: 'all',    label: isFr ? 'Tout'          : 'All' },
            { key: 'today',  label: isFr ? "Aujourd'hui"   : 'Today' },
            { key: 'week',   label: isFr ? 'Cette semaine' : 'This week' },
            { key: 'month',  label: isFr ? 'Ce mois'       : 'This month' },
            { key: 'custom', label: isFr ? 'Personnalisé'  : 'Custom' },
          ] as const).map(r => {
            const active = dateRange === r.key;
            return (
              <button
                key={r.key}
                onClick={() => {
                  setDateRange(r.key);
                  setShowCustomPicker(r.key === 'custom');
                  if (r.key !== 'custom') { setCustomFrom(''); setCustomTo(''); }
                }}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  active
                    ? 'bg-[#3D5F42] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {dateRange === 'custom' && showCustomPicker && (
          <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg p-2.5">
            <label className="text-[11px] text-gray-500 font-semibold">{isFr ? 'Du' : 'From'}</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#3D5F42]"
            />
            <label className="text-[11px] text-gray-500 font-semibold">{isFr ? 'Au' : 'To'}</label>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#3D5F42]"
            />
            {(customFrom || customTo) && (
              <button
                onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
              >
                <XIcon className="w-3 h-3" /> {isFr ? 'effacer' : 'clear'}
              </button>
            )}
          </div>
        )}

        {filterType && (
          <button
            onClick={() => setFilterType(null)}
            className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium"
          >
            {isFr ? 'Filtre' : 'Filter'}: {ENTRY_TYPE_LABELS[filterType]} ×
          </button>
        )}

        {/* The notebook page itself. Cream paper, faint rule lines,
            margin marker on the left. Body uses a serif so it reads
            like a written-in diary. */}
        <div
          className="rounded-2xl overflow-hidden shadow-sm border border-stone-200"
          style={{
            background: 'linear-gradient(180deg, #fdfaf2 0%, #fbf6e9 100%)',
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent 0,
              transparent 27px,
              rgba(120, 80, 20, 0.08) 28px
            )`,
            backgroundSize: '100% 28px',
          }}
        >
          {/* Red margin line, like real ruled paper. Pinned items
              stick out into this column with a paperclip icon. */}
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 w-px"
              style={{ left: '52px', background: 'rgba(190, 50, 50, 0.35)' }}
              aria-hidden="true"
            />
            <div className="pl-16 pr-6 sm:pr-10 py-6 sm:py-8 min-h-[400px]">
              {loading ? (
                <div className="py-12 text-center text-stone-500 italic">
                  {isFr ? 'Chargement du journal…' : 'Loading journal…'}
                </div>
              ) : grouped.length === 0 ? (
                <NotebookEmptyState tab={tab} onCompose={() => setShowCompose(true)} isFr={isFr} />
              ) : (
                <div className="space-y-8">
                  {grouped.map(([day, dayEntries]) => (
                    <DayPage
                      key={day}
                      day={day}
                      entries={dayEntries}
                      isOwner={isOwner}
                      selfId={profile?.id ?? null}
                      onPin={togglePin}
                      onImportant={toggleImportant}
                      onDelete={softDelete}
                      onFilterType={setFilterType}
                      isFr={isFr}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

function NotebookEmptyState({ tab, onCompose, isFr }: { tab: TabKey; onCompose: () => void; isFr: boolean }) {
  return (
    <div className="py-16 text-center" style={{ fontFamily: 'Georgia, serif' }}>
      <p className="text-stone-700 text-lg italic">
        {tab === 'activity' && (isFr
          ? "Votre registre d'activité est vide — commencez à enregistrer et les entrées apparaîtront ici."
          : 'Your activity ledger is blank — start logging and entries will appear here.')}
        {tab === 'notes' && (isFr
          ? 'Aucune note pour le moment. Écrivez la première.'
          : 'No notes yet. Write the first one.')}
        {tab === 'all' && (isFr
          ? "Une page vierge. Ajoutez une entrée, enregistrez une vente, ou attendez la note hebdomadaire d'Eden."
          : 'A fresh page. Add an entry, log a sale, or wait for Eden\'s weekly note.')}
      </p>
      {tab !== 'activity' && (
        <button
          onClick={onCompose}
          className="mt-6 inline-flex items-center gap-2 bg-[#3D5F42] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#2F4A34]"
        >
          <Plus className="w-4 h-4" /> {isFr ? 'Écrire une note' : 'Write a note'}
        </button>
      )}
    </div>
  );
}

function DayPage({
  day, entries, isOwner, selfId, onPin, onImportant, onDelete, onFilterType, isFr,
}: {
  day: string;
  entries: JournalEntry[];
  isOwner: boolean;
  selfId: string | null;
  onPin: (e: JournalEntry) => void;
  onImportant: (e: JournalEntry) => void;
  onDelete: (e: JournalEntry) => void;
  onFilterType: (t: string) => void;
  isFr: boolean;
}) {
  return (
    <section>
      {/* Date stamp — like the dated heading at the top of a journal
          page. Serif font, faint underline. */}
      <header className="mb-3 -ml-2">
        <h2
          className="inline-block text-stone-700 font-semibold text-base sm:text-lg pb-0.5 border-b border-stone-400/30"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {formatDayLabel(day, isFr)}
        </h2>
      </header>
      <div className="space-y-5">
        {entries.map(entry => (
          <JournalEntryBlock
            key={entry.id}
            entry={entry}
            isOwner={isOwner}
            selfId={selfId}
            onPin={() => onPin(entry)}
            onImportant={() => onImportant(entry)}
            onDelete={() => onDelete(entry)}
            onFilterType={onFilterType}
          />
        ))}
      </div>
    </section>
  );
}

function JournalEntryBlock({
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
      : entry.author?.full_name
      || entry.author?.email?.split('@')[0]
      || 'Someone';

  // Eden gets a sparkle prefix; pinned entries get a paperclip in the
  // margin; important entries get a small star at the byline end.
  return (
    <article className="relative">
      {/* Margin marker: paperclip for pinned, otherwise a tiny dot
          aligned with the byline. Sticks into the red rule line. */}
      <div className="absolute -left-12 top-0.5 flex items-center justify-center w-8 h-6">
        {entry.is_pinned ? (
          <Paperclip className="w-4 h-4 text-stone-500" />
        ) : entry.author_kind === 'eden' ? (
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
        )}
      </div>

      {/* Byline — italic, gentle. Time · author (role) · type tag. */}
      <p
        className="text-[12px] text-stone-500 italic"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        {time} · {' '}
        <span className="not-italic font-semibold text-stone-700">
          {authorName}
        </span>
        {entry.author_role && entry.author_kind !== 'eden' && (
          <span className="text-stone-500"> ({entry.author_role})</span>
        )}
        {' · '}
        <button
          onClick={() => onFilterType(entry.entry_type)}
          className="not-italic text-stone-500 underline-offset-2 hover:underline"
        >
          {ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type}
        </button>
        {entry.is_important && (
          <Star className="inline-block ml-1.5 w-3 h-3 text-amber-600 fill-amber-600 align-middle" />
        )}
        {entry.is_private && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-stone-500">
            <EyeOff className="w-3 h-3" />
          </span>
        )}
      </p>

      {entry.title && (
        <p
          className="mt-1 font-semibold text-stone-900 text-[15px]"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {entry.title}
        </p>
      )}

      {/* Body — serif, slightly larger line-height than default to
          match the 28px rule grid. Whitespace-pre-wrap so a worker's
          line breaks render. */}
      <p
        className="mt-1 text-stone-800 whitespace-pre-wrap break-words"
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '15px',
          lineHeight: '28px',
        }}
      >
        {entry.body}
      </p>

      {entry.photo_urls.length > 0 && (
        // Polaroid stack — slight tilt, taped tops. Up to 4 visible.
        <div className="flex flex-wrap gap-3 mt-3 ml-1">
          {entry.photo_urls.slice(0, 4).map((url, i) => (
            <div
              key={i}
              className="relative bg-white p-1.5 pb-4 shadow-md"
              style={{ transform: `rotate(${i % 2 === 0 ? -1 : 1}deg)` }}
            >
              <img src={url} alt="" className="w-24 h-24 object-cover" />
            </div>
          ))}
          {entry.photo_urls.length > 4 && (
            <span className="text-xs text-stone-500 italic self-center">
              +{entry.photo_urls.length - 4} more
            </span>
          )}
        </div>
      )}

      {entry.metadata?.chart != null && (
        <div className="mt-3 ml-1">
          <ChartBlock config={entry.metadata.chart as ChartConfig} />
        </div>
      )}

      {/* Activity rows get a small ↗ link to the underlying record */}
      {entry.channel === 'activity' && entry.metadata?.linked_table != null && (
        <button
          className="mt-2 text-xs text-[#3D5F42] hover:underline inline-flex items-center gap-0.5 italic"
          onClick={() => deepLinkToRecord(entry)}
          style={{ fontFamily: 'Georgia, serif' }}
        >
          view record <ChevronRight className="w-3 h-3" />
        </button>
      )}

      <EntryReactions entryId={entry.id} compact />

      {/* Hover-only actions row. Pinned/Important/Hide tucked away so
          the page reads like prose, not a control panel. */}
      {canEdit && (
        <div className="flex items-center gap-3 mt-2 text-[11px] text-stone-400 opacity-60 hover:opacity-100 transition-opacity">
          <button onClick={onPin} className="hover:text-stone-700 flex items-center gap-1">
            <Paperclip className="w-3 h-3" />
            {entry.is_pinned ? 'Unclip' : 'Clip'}
          </button>
          {isOwner && (
            <button onClick={onImportant} className="hover:text-amber-700 flex items-center gap-1">
              <Star className="w-3 h-3" />
              {entry.is_important ? 'Unmark' : 'Mark important'}
            </button>
          )}
          <button onClick={onDelete} className="hover:text-red-600 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Hide
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Take an activity entry's linked_table and navigate to the most
 * useful surface in-app.
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
    flocks: '#/flocks',
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

function formatDayLabel(isoDay: string, isFr: boolean = false): string {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  if (isoDay === today) return isFr ? "Aujourd'hui" : 'Today';
  if (isoDay === yesterday) return isFr ? 'Hier' : 'Yesterday';
  // Use the matching locale tag for weekday/month names so the FR UI
  // doesn't mix "Hier" with "Monday, May 12, 2026".
  return new Date(isoDay).toLocaleDateString(isFr ? 'fr-FR' : undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default JournalPage;
