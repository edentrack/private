import { useState, useEffect } from 'react';
import { Plus, X, Scale, Banknote, CheckCircle, Clock, Percent } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

interface RabbitHarvestRecord {
  id: string;
  farm_id: string;
  flock_id: string | null;
  harvested_at: string;
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

export function RabbitHarvestPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();
  const currency = currentFarm?.currency_code ?? 'XAF';

  const [records, setRecords] = useState<RabbitHarvestRecord[]>([]);
  const [flocks, setFlocks] = useState<RabbitFlock[]>([]);
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

  const loadRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rabbit_harvest_records')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('harvested_at', { ascending: false });
    if (error) {
      toast.error(isFr ? 'Échec du chargement des récoltes de lapins' : 'Failed to load rabbit harvest records');
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
    if (flocks.length > 0) setFormFlockId(flocks[0].id);
  };

  const handleSubmit = async () => {
    if (!formFlockId) { toast.error(isFr ? 'Veuillez sélectionner un élevage' : 'Please select a rabbitry'); return; }
    if (!formDate) { toast.error(isFr ? 'Sélectionnez la date de récolte' : 'Select harvest date'); return; }
    const count = parseInt(formCount, 10);
    if (!formCount || isNaN(count) || count <= 0) {
      toast.error(isFr ? 'Saisissez le nombre de lapins récoltés' : 'Enter number of rabbits harvested');
      return;
    }

    const liveKg = formLiveWeight ? parseFloat(formLiveWeight) : null;
    const carcassKg = formCarcassWeight ? parseFloat(formCarcassWeight) : null;
    const pricePerKg = formPricePerKg ? parseFloat(formPricePerKg) : null;
    const computedTotal = carcassKg && pricePerKg ? carcassKg * pricePerKg : null;
    const manualTotal = formTotalAmount ? parseFloat(formTotalAmount) : null;
    const totalAmount = computedTotal ?? manualTotal;

    setSubmitting(true);
    const { error } = await supabase.from('rabbit_harvest_records').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId,
      harvested_at: formDate,
      count,
      total_live_weight_kg: liveKg,
      total_carcass_weight_kg: carcassKg,
      price_per_kg: pricePerKg,
      total_amount: totalAmount,
      buyer_name: formBuyer || null,
      payment_status: formPayStatus,
      notes: formNotes || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error(isFr ? "Échec de l'enregistrement de la récolte" : 'Failed to save harvest record');
    } else {
      toast.success(isFr ? 'Récolte enregistrée' : 'Harvest record saved');
      resetForm();
      setShowForm(false);
      loadRecords();
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
            <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Récolte de lapins' : 'Rabbit Harvest'}</h1>
            <p className="text-sm text-gray-500">{isFr ? "Suivez les abattages, les poids et les revenus." : 'Track slaughter records, weights, and revenue.'}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? (isFr ? 'Annuler' : 'Cancel') : (isFr ? 'Enregistrer une récolte' : 'Log Harvest')}
        </button>
      </div>

      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="section-card text-center">
            <p className="text-xs text-gray-500 mb-1">{isFr ? 'Total récolté' : 'Total Harvested'}</p>
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
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{isFr ? 'Nouvelle récolte' : 'New Harvest Record'}</h2>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Date de récolte *' : 'Harvest Date *'}</label>
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
              {submitting ? (isFr ? 'Enregistrement...' : 'Saving...') : (isFr ? 'Enregistrer la récolte' : 'Save Harvest')}
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
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{isFr ? 'Aucune récolte enregistrée pour le moment' : 'No harvest records yet'}</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              {isFr
                ? "Enregistrez votre première récolte de lapins pour suivre les ventes et le rendement carcasse."
                : 'Log your first rabbit harvest to track sales and dressing yield.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isFr ? 'Première récolte' : 'Log First Harvest'}
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
                    <span className="text-xs text-gray-400">{fmtDate(record.harvested_at)}</span>
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
