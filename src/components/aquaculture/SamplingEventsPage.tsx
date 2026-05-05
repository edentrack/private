import { useState, useEffect, useMemo } from 'react';
import { Plus, Scale, X, Fish, TrendingUp, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import type { SamplingEvent } from '../../types/database';
import { WhyThisMatters } from '../common/WhyThisMatters';

interface AquaFlock {
  id: string;
  name: string;
  type: string;
  current_count: number;
  arrival_date: string;
}

const AQUA_TYPES = ['Catfish', 'Tilapia', 'Clarias', 'Other Fish'];

/**
 * Specific Growth Rate — % per day.
 *   SGR = (ln(W₂) - ln(W₁)) / Δdays × 100
 * A healthy catfish/tilapia at grow-out runs ~2-4% SGR.
 */
function specificGrowthRate(prevWeightG: number, currentWeightG: number, days: number): number | null {
  if (!prevWeightG || prevWeightG <= 0 || !currentWeightG || currentWeightG <= 0 || days <= 0) return null;
  return ((Math.log(currentWeightG) - Math.log(prevWeightG)) / days) * 100;
}

function daysBetween(a: string, b: string): number {
  const ad = parseDate(a).getTime();
  const bd = parseDate(b).getTime();
  return Math.round(Math.abs(bd - ad) / 86_400_000);
}

/** Parse a YYYY-MM-DD or ISO date as local date — avoids the UTC off-by-one. */
function parseDate(s: string): Date {
  const p = String(s).split(/[-T]/);
  return p.length >= 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(s);
}

function formatDate(s: string): string {
  return parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface SamplingEventsPageProps {
  onNavigate?: (view: string) => void;
}

export function SamplingEventsPage({ onNavigate }: SamplingEventsPageProps) {
  const { currentFarm } = useAuth();
  const toast = useToast();

  const [events, setEvents] = useState<SamplingEvent[]>([]);
  const [flocks, setFlocks] = useState<AquaFlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Form state
  const [formFlockId, setFormFlockId] = useState('');
  const [formDate, setFormDate] = useState(todayLocal);
  const [formWeights, setFormWeights] = useState<string[]>(Array(10).fill(''));
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadEvents();
  }, [currentFarm?.id]);

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('id, name, type, current_count, arrival_date')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .in('type', AQUA_TYPES)
      .order('name');
    const result = data || [];
    setFlocks(result);
    if (result.length > 0 && !formFlockId) setFormFlockId(result[0].id);
  };

  const loadEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sampling_events')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('sampled_at', { ascending: false });
    if (error) {
      toast.error('Failed to load sampling events');
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormDate(todayLocal());
    setFormWeights(Array(10).fill(''));
    setFormNotes('');
    if (flocks.length > 0) setFormFlockId(flocks[0].id);
  };

  const validWeights = useMemo(
    () => formWeights.map(w => parseFloat(w)).filter(n => Number.isFinite(n) && n > 0),
    [formWeights],
  );

  const previewAbw = useMemo(() => {
    if (validWeights.length === 0) return null;
    return validWeights.reduce((s, n) => s + n, 0) / validWeights.length;
  }, [validWeights]);

  const handleWeightChange = (idx: number, value: string) => {
    const next = [...formWeights];
    next[idx] = value;
    setFormWeights(next);
  };

  const addMoreWeights = () => {
    if (formWeights.length < 100) setFormWeights([...formWeights, ...Array(5).fill('')]);
  };

  const handleSubmit = async () => {
    if (!formFlockId) {
      toast.error('Please select a pond');
      return;
    }
    if (!formDate) {
      toast.error('Please select a sample date');
      return;
    }
    if (validWeights.length < 5) {
      toast.error('Enter at least 5 individual weights for a useful sample');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('sampling_events').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId,
      sampled_at: formDate,
      sample_size: validWeights.length,
      individual_weights_g: validWeights,
      abw_g: previewAbw,
      notes: formNotes || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error('Failed to save sampling event');
    } else {
      toast.success(`Sample saved · ABW ${previewAbw?.toFixed(1)} g`);
      resetForm();
      setShowForm(false);
      loadEvents();
    }
  };

  // ── Per-flock latest ABW + projection ────────────────────────────────────
  const latestByFlock = useMemo(() => {
    const map: Record<string, SamplingEvent> = {};
    for (const e of events) {
      if (!map[e.flock_id]) map[e.flock_id] = e;
    }
    return map;
  }, [events]);

  const flockOf = (id: string) => flocks.find(f => f.id === id);
  const flockName = (id: string) => flockOf(id)?.name ?? 'Unknown pond';

  // Project biomass: current_count × ABW / 1000 (kg)
  const projectedBiomass = (event: SamplingEvent): number | null => {
    const f = flockOf(event.flock_id);
    if (!f || !event.abw_g) return null;
    return (f.current_count * event.abw_g) / 1000;
  };

  // Per-event SGR vs the next-newer event for that pond (events are sorted desc)
  const sgrByEventId = useMemo(() => {
    const out: Record<string, number | null> = {};
    const byFlock: Record<string, SamplingEvent[]> = {};
    for (const e of events) (byFlock[e.flock_id] ||= []).push(e);
    for (const list of Object.values(byFlock)) {
      // list is desc by date; compare each event to the one before it (older)
      for (let i = 0; i < list.length - 1; i++) {
        const newer = list[i];
        const older = list[i + 1];
        const days = daysBetween(older.sampled_at, newer.sampled_at);
        out[newer.id] = specificGrowthRate(older.abw_g ?? 0, newer.abw_g ?? 0, days);
      }
    }
    return out;
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Weight Sampling</h1>
            <p className="text-sm text-gray-500">Track ABW, growth rate, and projected biomass per pond.</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Log Sample'}
        </button>
      </div>

      {/* Per-pond summary cards */}
      {flocks.length > 0 && Object.keys(latestByFlock).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {flocks.map(f => {
            const latest = latestByFlock[f.id];
            if (!latest) return null;
            const biomass = projectedBiomass(latest);
            const sgr = sgrByEventId[latest.id];
            return (
              <div key={f.id} className="section-card">
                <div className="flex items-center gap-2 mb-2">
                  <Fish className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-gray-900">{f.name}</span>
                  <span className="text-xs text-gray-500">· {f.type}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-indigo-50 rounded-lg p-2">
                    <div className="text-[10px] font-medium text-indigo-700 uppercase tracking-wide flex items-center">
                      ABW
                      {onNavigate && <WhyThisMatters topic="abw_sampling" onNavigate={onNavigate} />}
                    </div>
                    <div className="text-lg font-bold text-indigo-900">
                      {latest.abw_g ? `${latest.abw_g.toFixed(1)} g` : '—'}
                    </div>
                    <div className="text-[10px] text-indigo-600 mt-0.5">{formatDate(latest.sampled_at)}</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <div className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide flex items-center">
                      Biomass
                      {onNavigate && <WhyThisMatters topic="biomass_projection" onNavigate={onNavigate} />}
                    </div>
                    <div className="text-lg font-bold text-emerald-900">
                      {biomass != null ? `${biomass.toFixed(1)} kg` : '—'}
                    </div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">{f.current_count.toLocaleString()} fish</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 col-span-2">
                    <div className="text-[10px] font-medium text-amber-700 uppercase tracking-wide flex items-center">
                      Growth (SGR)
                      {onNavigate && <WhyThisMatters topic="sgr" onNavigate={onNavigate} />}
                    </div>
                    <div className="text-lg font-bold text-amber-900">
                      {sgr != null ? `${sgr.toFixed(2)} %/day` : '—'}
                    </div>
                    <div className="text-[10px] text-amber-600 mt-0.5">
                      {sgr == null
                        ? 'Need 2+ samples to show growth rate'
                        : sgr >= 2 ? 'Healthy grow-out' : sgr >= 1 ? 'Slowing — review feed' : 'Slow — investigate'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Add Form */}
      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Weight Sample</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pond *</label>
              {flocks.length === 0 ? (
                <p className="text-xs text-amber-600">No active aquaculture ponds found.</p>
              ) : (
                <select
                  value={formFlockId}
                  onChange={e => setFormFlockId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
                >
                  {flocks.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sample Date *</label>
              <input
                type="date"
                value={formDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center text-xs font-medium text-gray-600">
                Individual Weights (grams)
                <span className="ml-2 text-gray-400 font-normal">— at least 5, ideally 10–20</span>
                {onNavigate && <WhyThisMatters topic="sample_size_recommendation" onNavigate={onNavigate} />}
              </label>
              {previewAbw != null && (
                <span className="text-xs text-[#3D5F42] font-medium">
                  ABW preview: {previewAbw.toFixed(1)} g · {validWeights.length} fish
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {formWeights.map((w, idx) => (
                <input
                  key={idx}
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder={`#${idx + 1}`}
                  value={w}
                  onChange={e => handleWeightChange(idx, e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
                />
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              {validWeights.length < 5 && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Need at least 5 weights — currently {validWeights.length}
                </p>
              )}
              {formWeights.length < 100 && (
                <button
                  type="button"
                  onClick={addMoreWeights}
                  className="ml-auto text-xs text-gray-700 hover:text-gray-900 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add 5 more
                </button>
              )}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">optional</span></label>
            <input
              type="text"
              placeholder="e.g. Fish look healthy, uniform size, took 10 from each corner"
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
            />
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || flocks.length === 0 || validWeights.length < 5}
              className="px-5 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Save Sample'}
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      <div className="section-card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
              <Scale className="w-7 h-7 text-indigo-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No samples yet</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              Sample fish weights every 2–4 weeks to track growth rate and decide when to harvest.
            </p>
            <button
              onClick={() => { setShowForm(true); resetForm(); }}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Log First Sample
            </button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {events.map(e => {
              const sgr = sgrByEventId[e.id];
              const biomass = projectedBiomass(e);
              return (
                <div key={e.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{flockName(e.flock_id)}</span>
                      <span className="text-xs text-gray-400">{formatDate(e.sampled_at)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        <Scale className="w-3 h-3" />
                        ABW {e.abw_g ? `${e.abw_g.toFixed(1)} g` : '—'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded-full">
                        n = {e.sample_size}
                      </span>
                      {biomass != null && (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                          <Fish className="w-3 h-3" />
                          {biomass.toFixed(1)} kg biomass
                        </span>
                      )}
                      {sgr != null && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          sgr >= 2 ? 'bg-emerald-50 text-emerald-700' :
                          sgr >= 1 ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          <TrendingUp className="w-3 h-3" />
                          SGR {sgr.toFixed(2)}%/day
                        </span>
                      )}
                    </div>
                    {e.notes && <p className="text-xs text-gray-500 mt-1 truncate">{e.notes}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
