import { useEffect, useState, useCallback } from 'react';
import { Loader2, Layers, Calendar, Users, Plus, X, HeartOff, Skull } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { weeksSinceBirth, type GrowoutGroup } from '../../lib/reproducerLifecycle/types';
import { SPEC_RABBITS } from '../../lib/reproducerLifecycle/specs';

/**
 * Grow-out Groups — Rabbits.
 *
 * A grow-out group is a cohort of rabbits of known age born / bought in
 * on a known date. Each litter automatically creates a group via the
 * `rabbit_create_growout_from_litter` trigger; farmers can also create
 * "buy-in" groups manually for rabbits they didn't breed themselves
 * (this page's "Add cohort" button).
 *
 * Phase 2 surface (this commit):
 *   - Manual "Add cohort" form for buy-in groups
 *   - Per-card "Log mortality" quick action that decrements
 *     current_count via the DB trigger on mortality_records
 *   - Sales decrement count automatically via trigger when a
 *     rabbit_sales row references source_growout_group_id
 *
 * Phase 3 (future):
 *   - Inline weight tracking per cohort (avg weight, growth chart)
 *   - "Ready to sell" prompt when cohort hits market age (11 weeks
 *     for rabbits per SPEC_RABBITS.lifecycle.marketAgeWeeks)
 *   - Reproducer-template generalization: pigs/goats/etc. reuse this
 *     same component with species spec swapped
 *
 * Visual model: cards per group, simple and readable. Age is computed
 * client-side from birth_date so we don't store it (and so daylight-
 * saving doesn't drift our counters). Status pills drive sort order:
 * active first, then sold_out, then closed.
 */

function fmtBirth(date: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function RabbitGrowoutPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();
  const spec = SPEC_RABBITS;

  const [groups, setGroups] = useState<GrowoutGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add-cohort modal state ───────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState('');
  const [formBirthDate, setFormBirthDate] = useState(localToday());
  const [formStartCount, setFormStartCount] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // ── Mortality modal state ────────────────────────────────────────────
  const [mortalityGroup, setMortalityGroup] = useState<GrowoutGroup | null>(null);
  const [mortCount, setMortCount] = useState('1');
  const [mortDate, setMortDate] = useState(localToday());
  const [mortCause, setMortCause] = useState('');
  const [submittingMort, setSubmittingMort] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(spec.tables.growout)
      .select('*')
      .eq('farm_id', currentFarm.id)
      // Active groups float to the top; within each status, newest first.
      .order('status', { ascending: true })
      .order('birth_date', { ascending: false, nullsFirst: false });
    if (error) {
      toast.error(isFr ? 'Échec du chargement des cohortes' : 'Failed to load grow-out groups');
    } else {
      setGroups((data as GrowoutGroup[]) || []);
    }
    setLoading(false);
  }, [currentFarm?.id, isFr, toast, spec.tables.growout]);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  const resetAddForm = () => {
    setFormName('');
    setFormBirthDate(localToday());
    setFormStartCount('');
    setFormNotes('');
  };

  const handleAddCohort = async () => {
    if (!currentFarm?.id) return;
    if (!formName.trim()) {
      toast.error(isFr ? 'Donnez un nom à la cohorte' : 'Give the cohort a name');
      return;
    }
    const count = parseInt(formStartCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      toast.error(isFr ? 'Saisissez le nombre d\'animaux' : 'Enter the number of animals');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from(spec.tables.growout).insert({
      farm_id: currentFarm.id,
      name: formName.trim(),
      birth_date: formBirthDate || null,
      starting_count: count,
      current_count: count,
      status: 'active',
      // source_litter_id stays null — flags this as a manual buy-in,
      // distinguishing it from auto-created litter groups in the UI.
      notes: formNotes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(`${isFr ? 'Échec' : 'Failed'}: ${error.message}`);
      return;
    }
    toast.success(isFr ? 'Cohorte ajoutée' : 'Cohort added');
    resetAddForm();
    setShowAddForm(false);
    void loadGroups();
  };

  const handleLogMortality = async () => {
    if (!mortalityGroup || !currentFarm?.id) return;
    const count = parseInt(mortCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      toast.error(isFr ? 'Nombre invalide' : 'Invalid count');
      return;
    }
    if (count > mortalityGroup.current_count) {
      toast.error(
        isFr
          ? `Vous ne pouvez pas perdre plus que ${mortalityGroup.current_count}`
          : `Can't lose more than ${mortalityGroup.current_count} (group's current count)`
      );
      return;
    }
    setSubmittingMort(true);
    // The DB trigger `trg_mortality_decrement_growout` handles the
    // current_count decrement automatically when growout_group_id
    // is set.
    const { error } = await supabase.from('mortality_records').insert({
      farm_id: currentFarm.id,
      growout_group_id: mortalityGroup.id,
      count,
      death_date: mortDate || localToday(),
      cause: mortCause.trim() || null,
    });
    setSubmittingMort(false);
    if (error) {
      toast.error(`${isFr ? 'Échec' : 'Failed'}: ${error.message}`);
      return;
    }
    toast.success(isFr ? 'Perte enregistrée' : 'Mortality logged');
    setMortalityGroup(null);
    setMortCount('1');
    setMortCause('');
    void loadGroups();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {isFr ? 'Chargement…' : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isFr ? 'Cohortes d\'engraissement' : 'Grow-out Groups'}
            </h1>
            <p className="text-sm text-gray-500">
              {isFr
                ? 'Suivez chaque cohorte de lapins par âge et effectif.'
                : 'Track each rabbit cohort by age and current count.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setShowAddForm(v => !v); if (!showAddForm) resetAddForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2F4A34] transition-colors"
        >
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAddForm ? (isFr ? 'Annuler' : 'Cancel') : (isFr ? 'Ajouter une cohorte' : 'Add cohort')}
        </button>
      </div>

      {/* Manual add form — for "buy-in" cohorts (rabbits acquired,
          not bred in-house). Litter-spawned groups are created
          automatically by the DB trigger when a litter is logged. */}
      {showAddForm && (
        <div className="section-card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {isFr ? 'Nouvelle cohorte (achetée)' : 'New cohort (buy-in)'}
          </h2>
          <p className="text-xs text-gray-500 -mt-1">
            {isFr
              ? 'Pour les cohortes nées sur place, enregistrez plutôt une portée — la cohorte se crée automatiquement.'
              : 'For home-bred cohorts, log a litter instead — the cohort gets created automatically.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? 'Nom *' : 'Name *'}
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={isFr ? 'ex. Achat mai' : 'e.g. May buy-in'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? 'Date de naissance' : 'Birth date'}
              </label>
              <input
                type="date"
                value={formBirthDate}
                max={localToday()}
                onChange={e => setFormBirthDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? 'Nombre initial *' : 'Starting count *'}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={formStartCount}
                onChange={e => setFormStartCount(e.target.value)}
                placeholder="20"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? 'Notes' : 'Notes'}
              </label>
              <input
                type="text"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder={isFr ? 'Optionnel' : 'Optional'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={handleAddCohort}
            className="w-full px-4 py-2.5 bg-[#3D5F42] text-white text-sm font-semibold rounded-lg hover:bg-[#2F4A34] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isFr ? 'Enregistrer' : 'Save cohort'}
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="section-card text-center py-12">
          <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-700 mb-1">
            {isFr ? 'Aucune cohorte pour le moment' : 'No grow-out groups yet'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
            {isFr
              ? "Enregistrez une portée et une cohorte sera créée automatiquement avec la date de naissance et l'effectif."
              : 'Log a litter and a grow-out group is created automatically with the birth date and starting count. Or click "Add cohort" above for a buy-in group.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(g => {
            const weeks = weeksSinceBirth(g.birth_date);
            const isActive = g.status === 'active';
            const isSoldOut = g.status === 'sold_out';
            return (
              <div
                key={g.id}
                className={`rounded-2xl border p-4 ${
                  isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{g.name}</h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : isSoldOut
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {isActive
                      ? (isFr ? 'Actif' : 'Active')
                      : isSoldOut
                      ? (isFr ? 'Vendu' : 'Sold out')
                      : (isFr ? 'Clos' : 'Closed')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{fmtBirth(g.birth_date)}</span>
                  {weeks !== null && (
                    <span className="ml-auto text-[11px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {weeks}w
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-700 mb-3">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium">{g.current_count}</span>
                  <span className="text-gray-400">/ {g.starting_count}</span>
                  <span className="text-xs text-gray-400 ml-1">
                    {isFr ? 'restant' : 'alive'}
                  </span>
                  {weeks !== null && spec.lifecycle.marketAgeWeeks <= weeks && isActive && (
                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 uppercase tracking-wide">
                      {isFr ? 'Prêt' : 'Market ready'}
                    </span>
                  )}
                </div>
                {isActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setMortalityGroup(g);
                      setMortCount('1');
                      setMortDate(localToday());
                      setMortCause('');
                    }}
                    className="w-full px-3 py-1.5 border border-gray-200 hover:border-red-300 hover:bg-red-50 text-xs font-medium text-gray-700 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <HeartOff className="w-3.5 h-3.5 text-red-500" />
                    {isFr ? 'Enregistrer une perte' : 'Log mortality'}
                  </button>
                )}
                {g.source_litter_id && (
                  <p className="text-[11px] text-gray-400 mt-2 italic">
                    {isFr ? 'Issue d\'une portée' : 'Auto-created from a litter'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mortality modal — opens when "Log mortality" tapped on a card.
          The DB trigger decrements current_count automatically; we just
          insert the record and reload. */}
      {mortalityGroup && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Skull className="w-4 h-4 text-red-500" />
                <h2 className="font-bold text-gray-900 text-sm">
                  {isFr ? 'Perte dans' : 'Mortality in'} {mortalityGroup.name}
                </h2>
              </div>
              <button onClick={() => setMortalityGroup(null)}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500">
                {isFr ? 'Effectif actuel' : 'Current count'}:
                {' '}<span className="font-semibold text-gray-900">{mortalityGroup.current_count}</span>
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isFr ? 'Nombre perdu *' : 'Number lost *'}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={mortalityGroup.current_count}
                  value={mortCount}
                  onChange={e => setMortCount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isFr ? 'Date' : 'Date'}
                </label>
                <input
                  type="date"
                  value={mortDate}
                  max={localToday()}
                  onChange={e => setMortDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isFr ? 'Cause (optionnel)' : 'Cause (optional)'}
                </label>
                <input
                  type="text"
                  value={mortCause}
                  onChange={e => setMortCause(e.target.value)}
                  placeholder={isFr ? 'ex. maladie, chaleur' : 'e.g. disease, heat'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]"
                />
              </div>
              <button
                type="button"
                disabled={submittingMort}
                onClick={handleLogMortality}
                className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingMort && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isFr ? 'Enregistrer' : 'Log mortality'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RabbitGrowoutPage;
