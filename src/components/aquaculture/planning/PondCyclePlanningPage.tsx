import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Loader2, Fish, Info } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';

interface PondRow {
  id: string;
  name: string;
  species: string;
  start: Date;
  projectedHarvest: Date;
  initialCount: number;
  currentCount: number;
  status: string;
  stockingEvents: { date: Date; count: number }[];
  samplingEvents: { date: Date; abwG: number | null }[];
  actualHarvest: Date | null;
}

const CYCLE_DAYS_BY_SPECIES: Record<string, number> = {
  Catfish: 180,
  Tilapia: 150,
  Clarias: 180,
  'Other Fish': 180,
};

const SPECIES_COLORS: Record<string, { bar: string; light: string; text: string }> = {
  Catfish: { bar: 'bg-emerald-500', light: 'bg-emerald-100', text: 'text-emerald-800' },
  Tilapia: { bar: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-800' },
  Clarias: { bar: 'bg-cyan-600', light: 'bg-cyan-100', text: 'text-cyan-800' },
  'Other Fish': { bar: 'bg-violet-500', light: 'bg-violet-100', text: 'text-violet-800' },
};

const DAY_MS = 86_400_000;

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function fmtMonth(d: Date): string {
  return d.toLocaleString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function PondCyclePlanningPage() {
  const { currentFarm } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PondRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    if (!currentFarm) return;
    setLoading(true);
    const aquaSpecies = ['Catfish', 'Tilapia', 'Clarias', 'Other Fish'];

    const { data: flocks, error } = await supabase
      .from('flocks')
      .select('id, name, type, start_date, arrival_date, current_count, initial_count, status, archived_at')
      .eq('farm_id', currentFarm.id)
      .in('type', aquaSpecies)
      .order('start_date', { ascending: true });

    if (error) {
      showToast(`Failed to load: ${error.message}`, 'error');
      setLoading(false);
      return;
    }

    const flockIds = (flocks || []).map((f) => f.id);
    if (flockIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [stockRes, samplingRes, harvestRes] = await Promise.all([
      supabase
        .from('stocking_events')
        .select('flock_id, stocked_at, fingerling_count')
        .in('flock_id', flockIds),
      supabase
        .from('sampling_events')
        .select('flock_id, sampled_at, abw_g')
        .in('flock_id', flockIds),
      supabase
        .from('harvest_records')
        .select('flock_id, harvested_at')
        .in('flock_id', flockIds),
    ]);

    const stockingByFlock = new Map<string, { date: Date; count: number }[]>();
    (stockRes.data || []).forEach((s: { flock_id: string; stocked_at: string; fingerling_count: number }) => {
      const list = stockingByFlock.get(s.flock_id) ?? [];
      list.push({ date: new Date(s.stocked_at), count: s.fingerling_count });
      stockingByFlock.set(s.flock_id, list);
    });

    const samplingByFlock = new Map<string, { date: Date; abwG: number | null }[]>();
    (samplingRes.data || []).forEach((s: { flock_id: string; sampled_at: string; abw_g: number | null }) => {
      const list = samplingByFlock.get(s.flock_id) ?? [];
      list.push({ date: new Date(s.sampled_at), abwG: s.abw_g });
      samplingByFlock.set(s.flock_id, list);
    });

    const harvestByFlock = new Map<string, Date>();
    (harvestRes.data || []).forEach((h: { flock_id: string; harvested_at: string }) => {
      const existing = harvestByFlock.get(h.flock_id);
      const cur = new Date(h.harvested_at);
      if (!existing || cur < existing) harvestByFlock.set(h.flock_id, cur);
    });

    const built: PondRow[] = (flocks || []).map((f) => {
      const start = new Date(f.start_date || f.arrival_date);
      const cycleDays = CYCLE_DAYS_BY_SPECIES[f.type] ?? 180;
      const projected = new Date(start.getTime() + cycleDays * DAY_MS);
      const actualHarvest = harvestByFlock.get(f.id) ?? null;
      return {
        id: f.id,
        name: f.name,
        species: f.type,
        start,
        projectedHarvest: projected,
        initialCount: f.initial_count,
        currentCount: f.current_count,
        status: f.status,
        stockingEvents: stockingByFlock.get(f.id) ?? [],
        samplingEvents: samplingByFlock.get(f.id) ?? [],
        actualHarvest,
      };
    });

    setRows(built);
    setLoading(false);
  }, [currentFarm, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(
    () => (showArchived ? rows : rows.filter((r) => r.status !== 'archived')),
    [rows, showArchived]
  );

  const { rangeStart, rangeEnd, monthCount } = useMemo(() => {
    if (visibleRows.length === 0) {
      const now = new Date();
      return {
        rangeStart: startOfMonth(now),
        rangeEnd: addMonths(startOfMonth(now), 6),
        monthCount: 6,
      };
    }
    let earliest = visibleRows[0].start;
    let latest = visibleRows[0].projectedHarvest;
    visibleRows.forEach((r) => {
      if (r.start < earliest) earliest = r.start;
      const endCandidate = r.actualHarvest ?? r.projectedHarvest;
      if (endCandidate > latest) latest = endCandidate;
    });
    const start = startOfMonth(earliest);
    const endNext = addMonths(startOfMonth(latest), 2);
    const monthCount =
      (endNext.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (endNext.getUTCMonth() - start.getUTCMonth());
    return { rangeStart: start, rangeEnd: endNext, monthCount };
  }, [visibleRows]);

  const months = useMemo(() => {
    const m: Date[] = [];
    for (let i = 0; i < monthCount; i++) m.push(addMonths(rangeStart, i));
    return m;
  }, [rangeStart, monthCount]);

  const totalDays = (rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS;
  const dateToPct = (d: Date) =>
    Math.max(0, Math.min(100, ((d.getTime() - rangeStart.getTime()) / (totalDays * DAY_MS)) * 100));

  const today = new Date();
  const todayPct = dateToPct(today);

  if (!currentFarm) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-600">
        Select a farm to view the pond plan.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-600" />
            Pond cycle planner
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Visual timeline of every pond's stocking and projected harvest. Plan re-stocking around upcoming
            harvest dates.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded"
          />
          Show archived ponds
        </label>
      </div>

      {visibleRows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Fish className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900">No ponds yet</h2>
          <p className="text-sm text-gray-600 mt-1">
            Create a fish flock under {`Flocks → New flock`} to see it here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3 text-xs text-gray-600 flex-wrap">
            <Legend color="bg-emerald-500" label="Catfish (~180d)" />
            <Legend color="bg-blue-500" label="Tilapia (~150d)" />
            <Legend color="bg-cyan-600" label="Clarias (~180d)" />
            <Legend color="bg-violet-500" label="Other (~180d)" />
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Stocking event
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-fuchsia-500" />
              Sampling
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-0.5 bg-red-500" />
              Today
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${Math.max(700, monthCount * 80)}px` }}>
                {/* Header: month columns */}
                <div className="flex border-b border-gray-200">
                  <div className="w-48 flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide bg-gray-50">
                    Pond
                  </div>
                  <div className="flex-1 relative bg-gray-50">
                    <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${monthCount}, 1fr)` }}>
                      {months.map((m, i) => (
                        <div
                          key={i}
                          className="px-2 py-2 text-xs font-medium text-gray-600 border-l border-gray-200 first:border-l-0"
                        >
                          {fmtMonth(m)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Rows */}
                {visibleRows.map((row) => {
                  const colors = SPECIES_COLORS[row.species] ?? SPECIES_COLORS['Other Fish'];
                  const startPct = dateToPct(row.start);
                  const endDate = row.actualHarvest ?? row.projectedHarvest;
                  const endPct = dateToPct(endDate);
                  const widthPct = Math.max(0.5, endPct - startPct);
                  const dur = Math.round((endDate.getTime() - row.start.getTime()) / DAY_MS);
                  return (
                    <div key={row.id} className="flex border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      <div className="w-48 flex-shrink-0 px-3 py-3">
                        <div className="font-medium text-gray-900 text-sm truncate">{row.name}</div>
                        <div className={`text-xs ${colors.text} truncate`}>
                          {row.species} · {row.currentCount.toLocaleString()} fish
                        </div>
                        {row.status === 'archived' && (
                          <span className="inline-block text-[10px] uppercase tracking-wide text-gray-500 mt-1">
                            archived
                          </span>
                        )}
                      </div>
                      <div className="flex-1 relative h-16">
                        {/* Month grid */}
                        <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${monthCount}, 1fr)` }}>
                          {months.map((_, i) => (
                            <div key={i} className="border-l border-gray-100 first:border-l-0" />
                          ))}
                        </div>

                        {/* Today marker */}
                        {todayPct >= 0 && todayPct <= 100 && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
                            style={{ left: `${todayPct}%` }}
                          />
                        )}

                        {/* Cycle bar */}
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-6 ${colors.bar} rounded-md flex items-center px-2 text-[11px] text-white font-medium shadow-sm`}
                          style={{
                            left: `${startPct}%`,
                            width: `${widthPct}%`,
                            opacity: row.actualHarvest ? 0.6 : 1,
                          }}
                          title={`${fmtDate(row.start)} → ${fmtDate(endDate)} (${dur} days)`}
                        >
                          {widthPct > 8 && (
                            <span className="truncate">
                              {fmtDate(row.start)} → {fmtDate(endDate)}
                              {row.actualHarvest && ' ✓'}
                            </span>
                          )}
                        </div>

                        {/* Stocking events */}
                        {row.stockingEvents.map((s, i) => {
                          const p = dateToPct(s.date);
                          if (p < 0 || p > 100) return null;
                          return (
                            <div
                              key={`stk-${i}`}
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-500 border border-white"
                              style={{ left: `${p}%` }}
                              title={`Stocked ${s.count.toLocaleString()} fingerlings on ${fmtDate(s.date)}`}
                            />
                          );
                        })}

                        {/* Sampling events */}
                        {row.samplingEvents.map((s, i) => {
                          const p = dateToPct(s.date);
                          if (p < 0 || p > 100) return null;
                          return (
                            <div
                              key={`smp-${i}`}
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-fuchsia-500 border border-white"
                              style={{ left: `${p}%` }}
                              title={
                                s.abwG
                                  ? `Sampled ${s.abwG}g ABW on ${fmtDate(s.date)}`
                                  : `Sampled on ${fmtDate(s.date)}`
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 flex gap-3">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              Projected harvest dates assume typical cycles: <strong>catfish/clarias 180 days</strong>,{' '}
              <strong>tilapia 150 days</strong>. If your operation differs, sampling-event records will refine this
              estimate in a future update. Use this view to space out re-stocking so harvests don't collide and
              your buyers always have stock.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-3 h-3 rounded ${color}`} />
      {label}
    </span>
  );
}

export default PondCyclePlanningPage;
