import { useState, useEffect } from 'react';
import { Plus, X, Scale, Banknote, CheckCircle, Clock, Percent } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

interface RabbitSaleRecord {
  id: string;
  farm_id: string;
  flock_id: string | null;
  sold_at: string;
  count: number;
  total_live_weight_kg: number | null;
  total_carcass_weight_kg: number | null;
  dressing_pct: number | null;
  price_per_kg: number | null;
  total_amount: number | null;
  buyer_name: string | null;
  payment_status: 'pending' | 'paid';
  notes: string | null;
  created_at: string;
}

interface RabbitFlock {
  id: string;
  name: string;
  type: string;
}

const RABBIT_TYPES = ['Meat Rabbits', 'Breeder Rabbits'];

function formatCurrency(amount: number, code: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(s: string): string {
  const p = String(s).split(/[-T]/);
  if (p.length >= 3) {
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return s;
}

export function computeDressingPct(liveKg: number, carcassKg: number): number | null {
  if (liveKg <= 0) return null;
  return Math.round((carcassKg / liveKg) * 100 * 100) / 100;
}

export function RabbitSalesPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();
  const currency = currentFarm?.currency_code ?? 'XAF';

  const [records, setRecords] = useState<RabbitSaleRecord[]>([]);
  const [flocks, setFlocks] = useState<RabbitFlock[]>([]);
  const [growouts, setGrowouts] = useState<Array<{ id: string; name: string; current_count: number }>>([]);
  const [breeders, setBreeders] = useState<Array<{ id: string; tag: string; sex: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formFlockId, setFormFlockId] = useState('');
  const [formDate, setFormDate] = useState(localToday);
  const [formCount, setFormCount] = useState('');
  const [formLiveWeight, setFormLiveWeight] = useState('');
  const [formCarcassWeight, setFormCarcassWeight] = useState('');
  const [formPricePerKg, setFormPricePerKg] = useState('');
  const [formTotalAmount, setFormTotalAmount] = useState('');
  const [formBuyer, setFormBuyer] = useState('');
  const [formPayStatus, setFormPayStatus] = useState<'paid' | 'pending'>('pending');
  const [formNotes, setFormNotes] = useState('');
  // Source picker (Phase 2). The user chooses WHAT was sold:
  //   - 'cohort'  → pick a growout group (count caps at the group's
  //                 current_count, db trigger decrements after insert)
  //   - 'breeder' → pick a named individual from the registry
  //                 (sets sale count to 1 and marks the rabbit as
  //                 'sold' in the registry on success)
  //   - 'free'    → no source link, raw count entry. Same as before
  //                 Phase 2; preserved for farmers who haven't moved
  //                 to the cohort workflow yet.
  const [sourceKind, setSourceKind] = useState<'cohort' | 'breeder' | 'free'>('free');
  const [formGrowoutId, setFormGrowoutId] = useState<string>('');
  const [formBreederId, setFormBreederId] = useState<string>('');

  const previewDressingPct =
    formLiveWeight && formCarcassWeight
      ? computeDressingPct(parseFloat(formLiveWeight), parseFloat(formCarcassWeight))
      : null;

  const autoTotal =
    formCarcassWeight && formPricePerKg
      ? (parseFloat(formCarcassWeight) * parseFloat(formPricePerKg)).toFixed(0)
      : '';

  const displayTotal = autoTotal || formTotalAmount;

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadRecords();
    loadGrowouts();
    loadBreeders();
  }, [currentFarm?.id]);

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('id, name, type')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .in('type', RABBIT_TYPES)
      .order('name');
    const result = data || [];
    setFlocks(result);
    if (result.length > 0) setFormFlockId(result[0].id);
  };

  const loadGrowouts = async () => {
    const { data } = await supabase
      .from('rabbit_growout_groups')
      .select('id, name, current_count')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .gt('current_count', 0)
      .order('birth_date', { ascending: false, nullsFirst: false });
    setGrowouts(data || []);
  };

  const loadBreeders = async () => {
    const { data } = await supabase
      .from('rabbits')
      .select('id, tag, sex')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .order('tag');
    setBreeders(data || []);
  };

  const loadRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rabbit_sales')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('sold_at', { ascending: false });
    if (error) {
      toast.error(isFr ? 'Échec du chargement des ventes de lapins' : 'Failed to load rabbit sales');
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormDate(localToday());
    setFormCount('');
    setFormLiveWeight('');
    setFormCarcassWeight('');
    setFormPricePerKg('');
    setFormTotalAmount('');
    setFormBuyer('');
    setFormPayStatus('pending');
    setFormNotes('');
    setSourceKind('free');
    setFormGrowoutId('');
    setFormBreederId('');
    if (flocks.length > 0) setFormFlockId(flocks[0].id);
  };

  const handleSubmit = async () => {
    if (!formFlockId) { toast.error(isFr ? 'Veuillez sélectionner un élevage' : 'Please select a rabbitry'); return; }
    if (!formDate) { toast.error(isFr ? 'Sélectionnez la date de vente' : 'Select sale date'); return; }

    // Validate source-specific requirements before parsing count, so a
    // breeder sale's auto-count-of-1 doesn't get rejected by the
    // generic count check.
    if (sourceKind === 'cohort' && !formGrowoutId) {
      toast.error(isFr ? 'Choisissez une cohorte' : 'Pick a cohort to sell from');
      return;
    }
    if (sourceKind === 'breeder' && !formBreederId) {
      toast.error(isFr ? 'Choisissez un reproducteur' : 'Pick a named breeder to sell');
      return;
    }

    // Breeder sales always count 1; cohort sales validate against
    // the cohort's current_count; free-form trusts the user.
    let count: number;
    if (sourceKind === 'breeder') {
      count = 1;
    } else {
      count = parseInt(formCount, 10);
      if (!formCount || isNaN(count) || count <= 0) {
        toast.error(isFr ? 'Saisissez le nombre de lapins vendus' : 'Enter number of rabbits sold');
        return;
      }
      if (sourceKind === 'cohort') {
        const cohort = growouts.find(g => g.id === formGrowoutId);
        if (cohort && count > cohort.current_count) {
          toast.error(
            isFr
              ? `Cette cohorte n'a que ${cohort.current_count} animaux`
              : `That cohort only has ${cohort.current_count} alive`
          );
          return;
        }
      }
    }

    const liveKg = formLiveWeight ? parseFloat(formLiveWeight) : null;
    const carcassKg = formCarcassWeight ? parseFloat(formCarcassWeight) : null;
    const pricePerKg = formPricePerKg ? parseFloat(formPricePerKg) : null;
    const computedTotal = carcassKg && pricePerKg ? carcassKg * pricePerKg : null;
    const manualTotal = formTotalAmount ? parseFloat(formTotalAmount) : null;
    const totalAmount = computedTotal ?? manualTotal;

    setSubmitting(true);
    // The DB trigger `trg_rabbit_sales_decrement_growout` decrements
    // current_count automatically when source_growout_group_id is set.
    // For breeder sales we also flip the rabbits.status → 'sold' so
    // they fall out of the active registry.
    const { error } = await supabase.from('rabbit_sales').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId,
      sold_at: formDate,
      count,
      total_live_weight_kg: liveKg,
      total_carcass_weight_kg: carcassKg,
      price_per_kg: pricePerKg,
      total_amount: totalAmount,
      buyer_name: formBuyer || null,
      payment_status: formPayStatus,
      notes: formNotes || null,
      source_growout_group_id: sourceKind === 'cohort' ? formGrowoutId : null,
      source_rabbit_id:        sourceKind === 'breeder' ? formBreederId : null,
    });

    if (!error && sourceKind === 'breeder') {
      // Best-effort: mark the named breeder as 'sold'. We don't block
      // the success toast on this — the sale itself is the system of
      // record. If this fails (e.g. RLS quirk), the user can edit the
      // rabbit's status manually.
      await supabase
        .from('rabbits')
        .update({ status: 'sold' })
        .eq('id', formBreederId)
        .eq('farm_id', currentFarm!.id);
    }
    setSubmitting(false);

    if (error) {
      toast.error(isFr ? "Échec de l'enregistrement de la vente" : 'Failed to save sale record');
    } else {
      toast.success(isFr ? 'Vente enregistrée' : 'Sale recorded');
      resetForm();
      setShowForm(false);
      loadRecords();
      // Refresh source pickers so a fully-sold cohort drops off, a
      // sold breeder no longer appears, etc.
      void loadGrowouts();
      void loadBreeders();
    }
  };

  const getFlockName = (id: string | null) => flocks.find(f => f.id === id)?.name ?? (isFr ? 'Élevage inconnu' : 'Unknown rabbitry');
  const totalRevenue = records.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalCount = records.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-50 text-orange-600">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Ventes de lapins' : 'Rabbit Sales'}</h1>
            <p className="text-sm text-gray-500">{isFr ? "Suivez les ventes, les poids et les revenus." : 'Track sales, weights, and revenue.'}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? (isFr ? 'Annuler' : 'Cancel') : (isFr ? 'Enregistrer une vente' : 'Log Sale')}
        </button>
      </div>

      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="section-card text-center">
            <p className="text-xs text-gray-500 mb-1">{isFr ? 'Total vendu' : 'Total Sold'}</p>
            <p className="text-2xl font-bold text-gray-900">{totalCount.toLocaleString()} {isFr ? 'lapins' : 'rabbits'}</p>
          </div>
          <div className="section-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-gray-500">
              <Banknote className="w-4 h-4" />
              <span className="text-xs">{isFr ? 'Revenus totaux' : 'Total Revenue'}</span>
            </div>
            <p className="text-2xl font-bold text-[#3D5F42]">
              {totalRevenue > 0 ? formatCurrency(totalRevenue, currency) : ' - '}
            </p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{isFr ? 'Nouvelle vente' : 'New Sale'}</h2>

          {/* Source picker — pick WHAT was sold. Drives whether the
              sale links to a grow-out cohort, a named breeder, or
              neither (free-form count). The DB trigger handles count
              decrements for cohorts automatically. */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              {isFr ? 'Quoi vendre ?' : 'What was sold?'}
            </label>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {([
                { key: 'cohort',  label: isFr ? 'Une cohorte' : 'From a cohort',  disabled: growouts.length === 0 },
                { key: 'breeder', label: isFr ? 'Reproducteur' : 'Named breeder', disabled: breeders.length === 0 },
                { key: 'free',    label: isFr ? 'Comptage libre' : 'Free count',  disabled: false },
              ] as const).map(opt => {
                const active = sourceKind === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => setSourceKind(opt.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#3D5F42] text-white'
                        : opt.disabled
                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-[#3D5F42]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {sourceKind === 'cohort' && (
              <select
                value={formGrowoutId}
                onChange={e => {
                  setFormGrowoutId(e.target.value);
                  // Pre-fill count with the cohort's current count as a
                  // sensible default. User can edit.
                  const g = growouts.find(x => x.id === e.target.value);
                  if (g) setFormCount(String(g.current_count));
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              >
                <option value="">{isFr ? '— Choisir une cohorte —' : '— Pick a cohort —'}</option>
                {growouts.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.current_count} {isFr ? 'restants' : 'alive'})
                  </option>
                ))}
              </select>
            )}

            {sourceKind === 'breeder' && (
              <select
                value={formBreederId}
                onChange={e => { setFormBreederId(e.target.value); setFormCount('1'); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              >
                <option value="">{isFr ? '— Choisir un reproducteur —' : '— Pick a breeder —'}</option>
                {breeders.map(b => (
                  <option key={b.id} value={b.id}>
                    #{b.tag} ({b.sex === 'doe' ? (isFr ? 'femelle' : 'doe') : (isFr ? 'mâle' : 'buck')})
                  </option>
                ))}
              </select>
            )}

            {sourceKind === 'free' && (
              <p className="text-[11px] text-gray-400 italic">
                {isFr
                  ? 'Vente sans lien avec une cohorte ni un reproducteur. Compteur saisi à la main.'
                  : 'Sale not linked to a cohort or named breeder. Count entered manually below.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Élevage *' : 'Rabbitry *'}</label>
              {flocks.length === 0 ? (
                <p className="text-xs text-amber-600">{isFr ? 'Aucun élevage de lapins actif trouvé.' : 'No active rabbit flocks found.'}</p>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Date de vente *' : 'Sale Date *'}</label>
              <input
                type="date"
                value={formDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Nombre de lapins *' : 'Number of Rabbits *'}</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 10"
                value={formCount}
                onChange={e => setFormCount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Poids vif total (kg)' : 'Total Live Weight (kg)'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g. 25.0"
                value={formLiveWeight}
                onChange={e => setFormLiveWeight(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Poids carcasse total (kg)' : 'Total Carcass Weight (kg)'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g. 14.5"
                value={formCarcassWeight}
                onChange={e => setFormCarcassWeight(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
              {previewDressingPct !== null && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-[#3D5F42]">
                  <Percent className="w-3 h-3" />
                  {isFr ? 'Rendement carcasse' : 'Dressing %'}: <span className="font-semibold">{previewDressingPct}%</span>
                  <span className="text-gray-400">{isFr ? '(typique : 50–55 %)' : '(typical: 50–55%)'}</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? `Prix par kg (${currency})` : `Price per kg (${currency})`} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 3500"
                value={formPricePerKg}
                onChange={e => setFormPricePerKg(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isFr ? `Montant total (${currency})` : `Total Amount (${currency})`}
                {autoTotal && <span className="ml-1 text-xs text-[#3D5F42] font-normal">{isFr ? '(calculé automatiquement)' : '(auto-calculated)'}</span>}
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 50000"
                value={autoTotal || formTotalAmount}
                onChange={e => { if (!autoTotal) setFormTotalAmount(e.target.value); }}
                readOnly={!!autoTotal}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30 ${autoTotal ? 'bg-gray-50 text-gray-500' : ''}`}
              />
              {displayTotal && (
                <p className="text-xs text-[#3D5F42] mt-0.5">= {formatCurrency(parseFloat(displayTotal), currency)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? "Nom de l'acheteur" : 'Buyer Name'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? 'ex. Boucher local' : 'e.g. Local butcher'}
                value={formBuyer}
                onChange={e => setFormBuyer(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Statut de paiement' : 'Payment Status'}</label>
              <div className="flex gap-3">
                {(['pending', 'paid'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFormPayStatus(s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      formPayStatus === s
                        ? s === 'paid'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {isFr ? (s === 'paid' ? 'Payé' : 'En attente') : (s === 'paid' ? 'Paid' : 'Pending')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Notes' : 'Notes'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? 'ex. Vendu vif au marché' : 'e.g. Sold live weight at market'}
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
              {submitting ? (isFr ? 'Enregistrement...' : 'Saving...') : (isFr ? 'Enregistrer la vente' : 'Save Sale')}
            </button>
          </div>
        </div>
      )}

      <div className="section-card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mb-3">
              <Scale className="w-7 h-7 text-orange-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{isFr ? 'Aucune vente enregistrée pour le moment' : 'No sales yet'}</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              {isFr
                ? "Enregistrez votre première vente de lapins pour suivre les revenus et le rendement carcasse."
                : 'Log your first rabbit sale to track revenue and dressing yield.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isFr ? 'Première vente' : 'Log First Sale'}
            </button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {records.map(record => (
              <div key={record.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">
                      {getFlockName(record.flock_id)}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDate(record.sold_at)}</span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      record.payment_status === 'paid'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {record.payment_status === 'paid'
                        ? <CheckCircle className="w-3 h-3" />
                        : <Clock className="w-3 h-3" />}
                      {record.payment_status === 'paid' ? (isFr ? 'Payé' : 'Paid') : (isFr ? 'En attente' : 'Pending')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                      {record.count} {isFr ? (record.count !== 1 ? 'lapins' : 'lapin') : `rabbit${record.count !== 1 ? 's' : ''}`}
                    </span>
                    {record.total_live_weight_kg && (
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        <Scale className="w-3 h-3" />{isFr ? 'vif' : 'live'}: {Number(record.total_live_weight_kg).toLocaleString()} kg
                      </span>
                    )}
                    {record.total_carcass_weight_kg && (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        <Scale className="w-3 h-3" />{isFr ? 'carcasse' : 'carcass'}: {Number(record.total_carcass_weight_kg).toLocaleString()} kg
                      </span>
                    )}
                    {record.dressing_pct !== null && (
                      <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                        <Percent className="w-3 h-3" />{Number(record.dressing_pct)}{isFr ? '% rendement' : '% dressing'}
                      </span>
                    )}
                    {record.total_amount && (
                      <span className="inline-flex items-center gap-1 text-xs bg-[#3D5F42]/10 text-[#3D5F42] px-2 py-0.5 rounded-full">
                        <Banknote className="w-3 h-3" />{formatCurrency(Number(record.total_amount), currency)}
                      </span>
                    )}
                    {record.buyer_name && (
                      <span className="text-xs text-gray-500">→ {record.buyer_name}</span>
                    )}
                  </div>
                  {record.notes && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{record.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
