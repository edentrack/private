import { useState, useEffect, useMemo } from 'react';
import { Plus, Fish, X, Calendar, Banknote, Truck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import type { StockingEvent } from '../../types/database';

interface AquaFlock {
  id: string;
  name: string;
  type: string;
  current_count: number;
}

interface FingerlingSource {
  id: string;
  hatchery_name: string;
  trust_score?: number;
  avg_survival_pct?: number;
}

const AQUA_TYPES = ['Catfish', 'Tilapia', 'Clarias', 'Other Fish'];

function formatCurrency(amount: number, code: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Parse a YYYY-MM-DD or ISO date as local date — avoids the UTC off-by-one. */
function parseDate(s: string): Date {
  const p = String(s).split(/[-T]/);
  return p.length >= 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(s);
}

function formatDate(s: string): string {
  return parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function StockingEventsPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();
  const currency = currentFarm?.currency_code ?? 'XAF';

  const [events, setEvents] = useState<StockingEvent[]>([]);
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
  const [formSpecies, setFormSpecies] = useState('catfish');
  const [formCount, setFormCount] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formCostPer, setFormCostPer] = useState('');
  const [formTotalCost, setFormTotalCost] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const [knownSources, setKnownSources] = useState<FingerlingSource[]>([]);

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadEvents();
    loadKnownSources();
  }, [currentFarm?.id]);

  const loadKnownSources = async () => {
    // Phase B Step 25: power the source picker with the fingerling_sources
    // directory so farmers see "trust score / avg survival" for each
    // hatchery they've used before. Falls back silently if the migration
    // hasn't been applied yet (older deployments).
    const { data, error } = await supabase
      .from('fingerling_sources')
      .select('id, hatchery_name, trust_score, avg_survival_pct')
      .eq('farm_id', currentFarm!.id)
      .order('hatchery_name');
    if (!error && data) {
      setKnownSources(data as FingerlingSource[]);
    }
  };

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('id, name, type, current_count')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .in('type', AQUA_TYPES)
      .order('name');
    const result = data || [];
    setFlocks(result);
    if (result.length > 0 && !formFlockId) {
      setFormFlockId(result[0].id);
      // Pre-fill species from first pond
      const t = result[0].type.toLowerCase();
      setFormSpecies(t.includes('tilapia') ? 'tilapia' : t.includes('clarias') ? 'clarias' : 'catfish');
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stocking_events')
      .select('*, flocks!inner(type)')
      .eq('farm_id', currentFarm!.id)
      .order('stocked_at', { ascending: false });
    if (error) {
      toast.error(isFr ? "Échec du chargement des empoissonnements" : 'Failed to load stocking events');
    } else {
      // Display fallback: when species was saved as 'other' (e.g. by an
      // older OnboardingChat flow that didn't derive species from the
      // flock's type), use the parent flock's type as the species badge.
      // The DB row stays as-is — only the rendered string changes.
      const fixed = (data || []).map((e: any) => {
        const speciesLower = String(e.species || '').toLowerCase();
        if (speciesLower !== 'other') return e;
        const flockType = String(e.flocks?.type || '').toLowerCase();
        const derived = flockType === 'tilapia' ? 'tilapia'
          : flockType === 'catfish' ? 'catfish'
          : flockType === 'clarias' ? 'clarias'
          : 'other';
        return { ...e, species: derived };
      });
      setEvents(fixed);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormDate(todayLocal());
    setFormCount('');
    setFormSource('');
    setFormCostPer('');
    setFormTotalCost('');
    setFormNotes('');
    if (flocks.length > 0) {
      setFormFlockId(flocks[0].id);
      const t = flocks[0].type.toLowerCase();
      setFormSpecies(t.includes('tilapia') ? 'tilapia' : t.includes('clarias') ? 'clarias' : 'catfish');
    }
  };

  // When pond selection changes, default species from the pond's type
  const handleFlockChange = (flockId: string) => {
    setFormFlockId(flockId);
    const f = flocks.find(fl => fl.id === flockId);
    if (f) {
      const t = f.type.toLowerCase();
      setFormSpecies(t.includes('tilapia') ? 'tilapia' : t.includes('clarias') ? 'clarias' : 'catfish');
    }
  };

  // Auto-calculate total cost from count × cost_per (display only — user can override)
  const autoTotal = useMemo(() => {
    const c = parseInt(formCount);
    const p = parseFloat(formCostPer);
    if (!c || !p || isNaN(c) || isNaN(p)) return '';
    return (c * p).toFixed(0);
  }, [formCount, formCostPer]);

  const handleSubmit = async () => {
    if (!formFlockId) {
      toast.error(isFr ? 'Veuillez sélectionner un étang' : 'Please select a pond');
      return;
    }
    if (!formDate) {
      toast.error(isFr ? "Veuillez sélectionner une date d'empoissonnement" : 'Please select a stocking date');
      return;
    }
    const count = parseInt(formCount);
    if (!formCount || isNaN(count) || count <= 0) {
      toast.error(isFr ? "Veuillez entrer un nombre d'alevins valide" : 'Please enter a valid fingerling count');
      return;
    }

    const costPer = formCostPer ? parseFloat(formCostPer) : null;
    const computedTotal = costPer && count ? count * costPer : null;
    const manualTotal = formTotalCost ? parseFloat(formTotalCost) : null;
    const totalCost = computedTotal ?? manualTotal;

    setSubmitting(true);

    // Phase B Step 25: upsert the hatchery into fingerling_sources first so
    // future stocking events can pick it from the datalist + accumulate
    // trust score over time. Failure is non-fatal — we still write the
    // stocking event with the legacy free-text `source` field.
    let fingerling_source_id: string | null = null;
    const trimmedSource = (formSource || '').trim();
    if (trimmedSource) {
      const existing = knownSources.find(
        s => s.hatchery_name.toLowerCase() === trimmedSource.toLowerCase(),
      );
      if (existing) {
        fingerling_source_id = existing.id;
      } else {
        const { data: newSource } = await supabase
          .from('fingerling_sources')
          .insert({
            farm_id: currentFarm!.id,
            hatchery_name: trimmedSource,
          })
          .select('id')
          .single();
        if (newSource) fingerling_source_id = (newSource as any).id;
      }
    }

    const { error: insertError } = await supabase.from('stocking_events').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId,
      stocked_at: formDate,
      species: formSpecies,
      fingerling_count: count,
      source: trimmedSource || null,
      fingerling_source_id,
      cost_per_fingerling: costPer,
      total_cost: totalCost,
      notes: formNotes || null,
    });

    if (insertError) {
      setSubmitting(false);
      toast.error(isFr ? "Échec de l'enregistrement de l'empoissonnement" : 'Failed to save stocking event');
      return;
    }

    // Bump current_count on the pond — restocks add fish to the pond
    const flock = flocks.find(f => f.id === formFlockId);
    if (flock) {
      const newCount = flock.current_count + count;
      await supabase.from('flocks').update({ current_count: newCount }).eq('id', formFlockId);
    }

    setSubmitting(false);
    toast.success(isFr ? `Empoissonnement enregistré · +${count.toLocaleString()} alevins` : `Stocking event saved · +${count.toLocaleString()} fingerlings`);
    resetForm();
    setShowForm(false);
    loadEvents();
    loadFlocks(); // refresh current_count
  };

  const flockName = (id: string) => flocks.find(f => f.id === id)?.name ?? (isFr ? 'Étang inconnu' : 'Unknown pond');

  // Summary stats
  const totals = useMemo(() => {
    const totalFingerlings = events.reduce((s, e) => s + (e.fingerling_count || 0), 0);
    const totalSpend = events.reduce((s, e) => s + Number(e.total_cost || 0), 0);
    return { totalFingerlings, totalSpend };
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600">
            <Fish className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Empoissonnements' : 'Stocking Events'}</h1>
            <p className="text-sm text-gray-500">{isFr ? "Enregistrez les alevins introduits dans vos étangs - empoissonnement initial et rempoissonnements en cours de cycle." : 'Log fingerlings stocked into your ponds - initial stocking and mid-cycle restocks.'}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? (isFr ? 'Annuler' : 'Cancel') : (isFr ? 'Enregistrer un empoissonnement' : 'Log Stocking')}
        </button>
      </div>

      {/* Summary cards */}
      {events.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="section-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-gray-500">
              <Fish className="w-4 h-4" />
              <span className="text-xs font-medium">{isFr ? "Total d'alevins empoissonnés" : 'Total Fingerlings Stocked'}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totals.totalFingerlings.toLocaleString()}</p>
          </div>
          <div className="section-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-gray-500">
              <Banknote className="w-4 h-4" />
              <span className="text-xs font-medium">{isFr ? "Dépense totale d'empoissonnement" : 'Total Spend on Stocking'}</span>
            </div>
            <p className="text-2xl font-bold text-[#3D5F42]">
              {totals.totalSpend > 0 ? formatCurrency(totals.totalSpend, currency) : ' - '}
            </p>
          </div>
        </div>
      )}

      {/* Inline Add Form */}
      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{isFr ? 'Nouvel empoissonnement' : 'New Stocking Event'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Étang *' : 'Pond *'}</label>
              {flocks.length === 0 ? (
                <p className="text-xs text-amber-600">{isFr ? 'Aucun étang actif trouvé.' : 'No active aquaculture ponds found.'}</p>
              ) : (
                <select
                  value={formFlockId}
                  onChange={e => handleFlockChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
                >
                  {flocks.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.type} · {f.current_count.toLocaleString()} {isFr ? 'poissons' : 'fish'})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? "Date d'empoissonnement *" : 'Stocking Date *'}</label>
              <input
                type="date"
                value={formDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Espèce' : 'Species'}</label>
              <select
                value={formSpecies}
                onChange={e => setFormSpecies(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              >
                <option value="catfish">{isFr ? 'Poisson-chat' : 'Catfish'}</option>
                <option value="tilapia">Tilapia</option>
                <option value="clarias">Clarias</option>
                <option value="other">{isFr ? 'Autre poisson' : 'Other Fish'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? "Nombre d'alevins *" : 'Fingerling Count *'}</label>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 500"
                value={formCount}
                onChange={e => setFormCount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">{isFr ? "Sera ajouté au nombre actuel de poissons de l'étang" : "Will be added to the pond's current fish count"}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Truck className="inline w-3 h-3 mr-1" />{isFr ? 'Écloserie / Source' : 'Hatchery / Source'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span>
              </label>
              <input
                type="text"
                list="fingerling-sources-list"
                placeholder={isFr ? 'Saisissez un nom ou choisissez une écloserie précédente' : 'Type a name or pick a previous hatchery'}
                value={formSource}
                onChange={e => setFormSource(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
              {/* Datalist drives suggestions from previously-used hatcheries
                  (the fingerling_sources table). Picking a known one wires
                  the stocking event to that source via fingerling_source_id
                  on save. */}
              <datalist id="fingerling-sources-list">
                {knownSources.map(s => (
                  <option key={s.id} value={s.hatchery_name}>
                    {s.avg_survival_pct ? `${s.avg_survival_pct.toFixed(0)}${isFr ? '% de survie' : '% survival'}` : (isFr ? "pas d'historique" : 'no history yet')}
                  </option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? `Coût par alevin (${currency})` : `Cost per fingerling (${currency})`} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 50"
                value={formCostPer}
                onChange={e => setFormCostPer(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? `Coût total (${currency})` : `Total Cost (${currency})`}
                {autoTotal && <span className="ml-1 text-xs text-[#3D5F42] font-normal">{isFr ? '(auto)' : '(auto)'}</span>}
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 25000"
                value={autoTotal || formTotalCost}
                onChange={e => { if (!autoTotal) setFormTotalCost(e.target.value); }}
                readOnly={!!autoTotal}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30 ${autoTotal ? 'bg-gray-50 text-gray-500' : ''}`}
              />
              {(autoTotal || formTotalCost) && (
                <p className="text-xs text-[#3D5F42] mt-0.5">
                  = {formatCurrency(parseFloat(autoTotal || formTotalCost), currency)}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Notes' : 'Notes'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? 'ex. Rempoissonnement après récolte partielle' : 'e.g. Restock after partial harvest'}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || flocks.length === 0}
              className="px-5 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (isFr ? 'Enregistrement…' : 'Saving…') : (isFr ? "Enregistrer l'empoissonnement" : 'Save Stocking')}
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
            <div className="w-14 h-14 rounded-full bg-cyan-50 flex items-center justify-center mb-3">
              <Fish className="w-7 h-7 text-cyan-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{isFr ? 'Aucun empoissonnement enregistré pour le moment' : 'No stocking events yet'}</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              {isFr
                ? "Enregistrez chaque lot d'alevins que vous mettez dans un étang - empoissonnement initial, rempoissonnements, ajouts mixtes."
                : 'Log every batch of fingerlings you put in a pond - initial stocking, restocks, mixed-batch additions.'}
            </p>
            <button
              onClick={() => { setShowForm(true); resetForm(); }}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isFr ? 'Premier empoissonnement' : 'Log First Stocking'}
            </button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {events.map(e => (
              <div key={e.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{flockName(e.flock_id)}</span>
                    <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(e.stocked_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full">
                      <Fish className="w-3 h-3" />
                      {(e.fingerling_count || 0).toLocaleString()} {isFr ? 'alevins' : 'fingerlings'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                      {e.species}
                    </span>
                    {e.source && (
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-700 px-2 py-0.5 rounded-full">
                        <Truck className="w-3 h-3" />
                        {e.source}
                      </span>
                    )}
                    {e.total_cost && (
                      <span className="inline-flex items-center gap-1 text-xs bg-[#3D5F42]/10 text-[#3D5F42] px-2 py-0.5 rounded-full">
                        <Banknote className="w-3 h-3" />
                        {formatCurrency(Number(e.total_cost), currency)}
                      </span>
                    )}
                    {e.cost_per_fingerling && (
                      <span className="text-xs text-gray-400">
                        @ {formatCurrency(Number(e.cost_per_fingerling), currency)}/{isFr ? 'alevin' : 'fingerling'}
                      </span>
                    )}
                  </div>
                  {e.notes && <p className="text-xs text-gray-500 mt-1 truncate">{e.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
