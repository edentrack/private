import { useEffect, useRef, useState } from 'react';
import { Plus, Minus, Trash2, ChevronDown, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Flock, MortalityLog } from '../../types/database';
import { usePermissions } from '../../contexts/PermissionsContext';
import { canPerformAction } from '../../utils/navigationPermissions';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { useLanguage } from '../../contexts/LanguageContext';

interface MortalityTrackingProps {
  flock: Flock | null;
}

export function MortalityTracking({ flock: flockProp }: MortalityTrackingProps) {
  const { currentRole, currentFarm } = useAuth();
  const { farmPermissions } = usePermissions();
  const canLog = canPerformAction(currentRole, 'create', 'mortality', farmPermissions);
  const toast = useToast();
  const species = useFarmSpecies();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [availableFlocks, setAvailableFlocks] = useState<Flock[]>([]);
  const [selectedFlock, setSelectedFlock] = useState<Flock | null>(flockProp);
  const flock = selectedFlock || flockProp;
  const [count, setCount] = useState(0);
  const [reason, setReason] = useState(species.lossReasons[species.lossReasons.indexOf('Unknown')] ?? species.lossReasons[0]);
  const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState('');
  const [logs, setLogs] = useState<MortalityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const lossReasons = species.lossReasons;

  useEffect(() => {
    if (!currentFarm?.id) return;
    supabase.from('flocks').select('*').eq('farm_id', currentFarm.id).eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAvailableFlocks(data || []);
        if (!selectedFlock && data && data.length > 0) {
          setSelectedFlock(flockProp || data[0]);
        }
      });
  }, [currentFarm?.id]);

  useEffect(() => {
    if (flockProp) setSelectedFlock(flockProp);
  }, [flockProp?.id]);

  useEffect(() => {
    if (flock) {
      loadMortalityLogs();
    }
  }, [flock?.id]);

  const loadMortalityLogs = async () => {
    if (!flock) return;

    // Defense-in-depth: scope by farm_id alongside flock_id.
    const { data } = await supabase
      .from('mortality_logs')
      .select('*')
      .eq('farm_id', flock.farm_id)
      .eq('flock_id', flock.id)
      .order('event_date', { ascending: false })
      .limit(100);

    setLogs(data || []);
  };

  const handleSave = async () => {
    if (!flock || count === 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('mortality_logs').insert({
        flock_id: flock.id,
        farm_id: flock.farm_id,
        event_date: date,
        count,
        cause: reason,
        notes,
      });

      if (error) throw error;

      const newCount = Math.max(0, flock.current_count - count);
      await supabase
        .from('flocks')
        .update({ current_count: newCount })
        .eq('id', flock.id)
        .eq('farm_id', flock.farm_id);

      setCount(0);
      setDate(todayLocal());
      setNotes('');
      loadMortalityLogs();
      toast.success(`${species.lossNoun} logged successfully`);
    } catch (error) {
      console.error('Error logging mortality:', error);
      toast.error(`Failed to log ${species.lossNoun.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (log: MortalityLog) => {
    if (!flock) return;

    if (!confirm(`Delete ${species.lossNoun.toLowerCase()} record of ${log.count} ${species.animalTermPlural.toLowerCase()} on ${new Date(log.event_date).toLocaleDateString()}?`)) {
      return;
    }

    setDeletingId(log.id);
    try {
      const { error } = await supabase
        .from('mortality_logs')
        .delete()
        .eq('id', log.id)
        .eq('farm_id', flock.farm_id);

      if (error) throw error;

      const newCount = flock.current_count + log.count;
      await supabase
        .from('flocks')
        .update({ current_count: newCount })
        .eq('id', flock.id)
        .eq('farm_id', flock.farm_id);

      loadMortalityLogs();
      toast.success(`${species.lossNoun} record deleted`);
    } catch (error) {
      console.error('Error deleting mortality log:', error);
      toast.error(`Failed to delete ${species.lossNoun.toLowerCase()} record`);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Mortality trend chart — flock-aware weekly bins (May 2026) ──────
  //
  // PRIOR BUG: hardcoded `const weeks = 4`. A broiler at week 30 saw
  // only the last 4 calendar weeks. User feedback: "it shows week 1 2
  // 3 4 but we are in week 30 and I don't see all the other weeks."
  //
  // Fix: anchor weeks to the flock's start_date (fallback arrival_date,
  // fallback created_at) and bin from week 1 → current week of the
  // flock. Each bar represents one calendar week of the flock's life,
  // labelled by its flock-relative week number ("Wk 12") rather than
  // "12 weeks ago".
  //
  // When the flock is older than the visible bar window, the chart
  // becomes horizontally scrollable (overflow handled in the JSX
  // below). Latest week is rightmost so the most recent data stays in
  // view; users scroll left to look at the early weeks.
  const getWeeklyData = () => {
    if (!flock) return [];
    const rawStart =
      (flock as any).start_date ||
      (flock as any).arrival_date ||
      (flock as any).created_at;
    const flockStart = rawStart ? new Date(rawStart) : null;
    if (!flockStart || isNaN(flockStart.getTime())) return [];
    flockStart.setHours(0, 0, 0, 0);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    // +1 so a flock placed today renders as Week 1, not Week 0.
    const totalWeeks = Math.max(
      1,
      Math.floor((now.getTime() - flockStart.getTime()) / msPerWeek) + 1
    );

    const weeklyData: { week: string; count: number; weekNumber: number }[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      const weekStart = new Date(flockStart.getTime() + (w - 1) * msPerWeek);
      const weekEnd = new Date(flockStart.getTime() + w * msPerWeek);
      const totalCount = logs
        .filter(log => {
          const d = new Date(log.event_date);
          return d >= weekStart && d < weekEnd;
        })
        .reduce((sum, log) => sum + log.count, 0);
      weeklyData.push({
        week: `${isFr ? 'Sem' : 'Wk'} ${w}`,
        count: totalCount,
        weekNumber: w,
      });
    }
    return weeklyData;
  };

  const weeklyData = getWeeklyData();
  const maxCount = Math.max(...weeklyData.map(d => d.count), 1);

  if (!flock && availableFlocks.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center">
        <p className="text-gray-600">{isFr ? `Aucun(e) ${species.groupTerm.toLowerCase()} actif(ve) trouvé(e). Créez d'abord un(e) ${species.groupTerm.toLowerCase()}.` : `No active ${species.groupTermPlural.toLowerCase()} found. Create a ${species.groupTerm.toLowerCase()} first.`}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isFr ? `Suivi des ${species.lossNounPlural.toLowerCase()}` : `${species.lossNoun} Tracking`}</h2>
          {flock && <p className="text-gray-600">{flock.name}</p>}
        </div>
        {availableFlocks.length > 1 && (
          <div className="relative">
            <select
              value={flock?.id || ''}
              onChange={e => {
                const f = availableFlocks.find(f => f.id === e.target.value);
                if (f) setSelectedFlock(f);
              }}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {availableFlocks.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">{isFr ? `${species.lossNounPlural} d'aujourd'hui` : `Today's ${species.lossNounPlural}`}</h3>

        <div className="flex items-center justify-center space-x-6 mb-6">
          {canLog && (
            <button
              onClick={() => setCount(Math.max(0, count - 1))}
              className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors"
            >
              <Minus className="w-6 h-6 text-gray-700" />
            </button>
          )}

          <div className="text-5xl font-bold text-gray-900 w-24 text-center">
            {count}
          </div>

          {canLog && (
            <button
              onClick={() => setCount(count + 1)}
              className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors"
            >
              <Plus className="w-6 h-6 text-gray-700" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? `Raison de la ${species.lossNoun.toLowerCase()}` : `Reason for ${species.lossNoun}`}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
            >
              {lossReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? 'Date' : 'Date'}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isFr ? 'Notes (Optionnel)' : 'Notes (Optional)'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
              rows={3}
              placeholder={isFr ? 'Détails supplémentaires...' : 'Additional details...'}
            />
          </div>

          {canLog && (
            <button
              onClick={handleSave}
              disabled={loading || count === 0}
              className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-medium hover:bg-[#2F4A34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (isFr ? 'Enregistrement…' : 'Saving…') : (isFr ? `Enregistrer la ${species.lossNoun.toLowerCase()}` : `Record ${species.lossNoun}`)}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-bold text-gray-900">
            {isFr ? `Tendance des ${species.lossNounPlural.toLowerCase()}` : `${species.lossNounPlural} Trend`}
          </h3>
          {weeklyData.length > 0 && (
            <span className="text-xs text-gray-500">
              {isFr
                ? `Sem 1 → ${weeklyData.length} (depuis le démarrage du lot)`
                : `Week 1 → ${weeklyData.length} (since flock start)`}
            </span>
          )}
        </div>

        {/* Horizontally scrollable. When the flock is older than ~12
            weeks, the chart overflows; we auto-scroll the container to
            the right on mount so the latest weeks are visible. Each
            bar's min-width keeps them tappable on phones — they never
            shrink below 32 px wide regardless of bar count. */}
        <ChartScroll>
          <div
            className="h-64 flex items-end gap-2"
            style={{ minWidth: `${Math.max(weeklyData.length * 40, 240)}px` }}
          >
            {weeklyData.map((data, index) => (
              <div key={index} className="flex flex-col items-center" style={{ minWidth: '32px', flex: '1 1 32px' }}>
                <div className="w-full bg-gray-100 rounded-t-lg overflow-hidden relative" style={{ height: '200px' }}>
                  <div
                    className="absolute bottom-0 w-full bg-[#3D5F42] rounded-t-lg transition-all duration-300"
                    style={{ height: `${(data.count / maxCount) * 100}%` }}
                  />
                  {data.count > 0 && (
                    <div className="absolute top-2 left-0 right-0 text-center text-xs font-semibold text-gray-700">
                      {data.count}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-gray-600 mt-2 font-medium whitespace-nowrap">
                  {data.week}
                </div>
              </div>
            ))}
          </div>
        </ChartScroll>
      </div>

      {logs.length > 0 ? (
        <div className="bg-white rounded-3xl p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{isFr ? 'Enregistrements récents' : 'Recent Logs'}</h3>
          <div className="space-y-3">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{log.cause}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(log.event_date).toLocaleDateString()}
                    {log.notes && <span className="ml-2 text-gray-400">• {log.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-lg font-bold text-gray-900">{log.count}</div>
                  {canLog && (
                    <button
                      onClick={() => handleDelete(log)}
                      disabled={deletingId === log.id}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors group disabled:opacity-50"
                      title={isFr ? 'Supprimer cet enregistrement' : 'Delete this record'}
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-600" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center">
          <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">{isFr ? `Aucune ${species.lossNoun.toLowerCase()} enregistrée` : `No ${species.lossNounPlural.toLowerCase()} recorded`}</h3>
          <p className="text-gray-600 max-w-sm mx-auto text-sm">
            {currentRole === 'viewer'
              ? (isFr
                  ? `Demandez à votre responsable d'enregistrer les ${species.lossNounPlural.toLowerCase()}. L'historique apparaîtra ici.`
                  : `Ask your manager to record ${species.lossNoun.toLowerCase()} events. Historical data will appear here.`)
              : (isFr
                  ? `Enregistrez les ${species.lossNounPlural.toLowerCase()} au fur et à mesure pour suivre la santé des ${species.animalTermPlural.toLowerCase()}.`
                  : `Record ${species.lossNoun.toLowerCase()} events as they occur to track ${species.animalTermPlural.toLowerCase()} health and losses.`)}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Horizontal scroll container for the weekly trend chart. Auto-scrolls
 * to the rightmost edge on mount so the latest week is visible by
 * default, then lets the user scroll left to look at older weeks.
 *
 * Kept as a small internal helper rather than extracted to common/
 * because the scroll-to-end-on-mount behaviour is specific to "last
 * week is what you want to see first" charts and would otherwise need
 * a configuration prop.
 */
function ChartScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      // Defer to next frame so the bar widths have settled before we
      // try to scroll to the right edge.
      requestAnimationFrame(() => {
        if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
      });
    }
  }, []);
  return (
    <div
      ref={ref}
      className="overflow-x-auto -mx-2 px-2 pb-1"
      style={{ scrollbarWidth: 'thin' }}
    >
      {children}
    </div>
  );
}
