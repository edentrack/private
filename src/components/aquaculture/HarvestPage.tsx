import { useState, useEffect } from 'react';
import { Plus, Fish, X, Scale, Banknote, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import type { HarvestRecord } from '../../types/database';

interface AquaFlock {
  id: string;
  name: string;
  type: string;
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

export function HarvestPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();
  const currency = currentFarm?.currency_code ?? 'XAF';

  const [records, setRecords] = useState<HarvestRecord[]>([]);
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
  const [formWeight, setFormWeight] = useState('');
  const [formPricePerKg, setFormPricePerKg] = useState('');
  const [formTotalAmount, setFormTotalAmount] = useState('');
  const [formBuyer, setFormBuyer] = useState('');
  const [formPayStatus, setFormPayStatus] = useState<'paid' | 'pending'>('pending');
  const [formNotes, setFormNotes] = useState('');

  // Auto-calculate total when weight or price changes
  const autoTotal =
    formWeight && formPricePerKg
      ? (parseFloat(formWeight) * parseFloat(formPricePerKg)).toFixed(0)
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
      .in('type', AQUA_TYPES)
      .order('name');
    const result = data || [];
    setFlocks(result);
    if (result.length > 0) setFormFlockId(result[0].id);
  };

  const loadRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('harvest_records')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('harvested_at', { ascending: false });
    if (error) {
      toast.error(isFr ? 'Échec du chargement des récoltes' : 'Failed to load harvest records');
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormDate(todayLocal());
    setFormWeight('');
    setFormPricePerKg('');
    setFormTotalAmount('');
    setFormBuyer('');
    setFormPayStatus('pending');
    setFormNotes('');
    if (flocks.length > 0) setFormFlockId(flocks[0].id);
  };

  const handleSubmit = async () => {
    if (!formFlockId) {
      toast.error(isFr ? 'Veuillez sélectionner un étang' : 'Please select a pond/flock');
      return;
    }
    if (!formDate) {
      toast.error(isFr ? 'Veuillez sélectionner une date de récolte' : 'Please select a harvest date');
      return;
    }
    const weight = parseFloat(formWeight);
    if (!formWeight || isNaN(weight) || weight <= 0) {
      toast.error(isFr ? 'Veuillez entrer un poids valide' : 'Please enter a valid weight');
      return;
    }

    const pricePerKg = formPricePerKg ? parseFloat(formPricePerKg) : null;
    const computedTotal = pricePerKg ? weight * pricePerKg : null;
    const manualTotal = formTotalAmount ? parseFloat(formTotalAmount) : null;
    const totalAmount = computedTotal ?? manualTotal;

    setSubmitting(true);
    const { error } = await supabase.from('harvest_records').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId,
      harvested_at: formDate,
      total_weight_kg: weight,
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

  const getFlockName = (id: string) => flocks.find(f => f.id === id)?.name ?? (isFr ? 'Étang inconnu' : 'Unknown pond');

  // Summary stats
  const totalKg = records.reduce((s, r) => s + Number(r.total_weight_kg || 0), 0);
  const totalRevenue = records.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
            <Fish className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Enregistrements de récolte' : 'Harvest Records'}</h1>
            <p className="text-sm text-gray-500">{isFr ? 'Suivez les récoltes de poisson, les poids et les revenus.' : 'Track fish harvests, weights, and revenue.'}</p>
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

      {/* Summary cards */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="section-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-gray-500">
              <Scale className="w-4 h-4" />
              <span className="text-xs font-medium">{isFr ? 'Total récolté' : 'Total Harvested'}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalKg.toLocaleString()} kg</p>
          </div>
          <div className="section-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-gray-500">
              <Banknote className="w-4 h-4" />
              <span className="text-xs font-medium">{isFr ? 'Revenus totaux' : 'Total Revenue'}</span>
            </div>
            <p className="text-2xl font-bold text-[#3D5F42]">
              {totalRevenue > 0 ? formatCurrency(totalRevenue, currency) : ' - '}
            </p>
          </div>
        </div>
      )}

      {/* Inline Add Form */}
      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{isFr ? 'Nouvel enregistrement de récolte' : 'New Harvest Record'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Étang *' : 'Pond *'}</label>
              {flocks.length === 0 ? (
                <p className="text-xs text-amber-600">{isFr ? 'Aucun étang actif trouvé.' : 'No active aquaculture flocks found.'}</p>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Poids total (kg) *' : 'Total Weight (kg) *'}</label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g. 120.5"
                value={formWeight}
                onChange={e => setFormWeight(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? `Prix par kg (${currency})` : `Price per kg (${currency})`} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 1200"
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
                placeholder="e.g. 144000"
                value={autoTotal || formTotalAmount}
                onChange={e => {
                  if (!autoTotal) setFormTotalAmount(e.target.value);
                }}
                readOnly={!!autoTotal}
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30 ${autoTotal ? 'bg-gray-50 text-gray-500' : ''}`}
              />
              {displayTotal && (
                <p className="text-xs text-[#3D5F42] mt-0.5">
                  = {formatCurrency(parseFloat(displayTotal), currency)}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? "Nom de l'acheteur" : 'Buyer Name'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? 'ex. Vendeur du marché' : 'e.g. Market vendor'}
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
                placeholder={isFr ? 'ex. Tailles mixtes, étang 2' : 'e.g. Mixed sizes, pond 2'}
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

      {/* Records list */}
      <div className="section-card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mb-3">
              <Fish className="w-7 h-7 text-teal-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{isFr ? 'Aucune récolte enregistrée pour le moment' : 'No harvest records yet'}</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              {isFr
                ? 'Enregistrez votre première récolte pour commencer le suivi des ventes et revenus.'
                : 'Log your first harvest to start tracking fish sales and revenue.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isFr ? 'Enregistrer la première récolte' : 'Log First Harvest'}
            </button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {records.map(record => (
              <div key={record.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{getFlockName(record.flock_id)}</span>
                    <span className="text-xs text-gray-400">
                      {(() => { const p = String(record.harvested_at).split(/[-T]/); const d = p.length >= 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(record.harvested_at); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); })()}
                    </span>
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
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      <Scale className="w-3 h-3" />{Number(record.total_weight_kg).toLocaleString()} kg
                    </span>
                    {record.total_amount && (
                      <span className="inline-flex items-center gap-1 text-xs bg-[#3D5F42]/10 text-[#3D5F42] px-2 py-0.5 rounded-full">
                        <Banknote className="w-3 h-3" />{formatCurrency(Number(record.total_amount), currency)}
                      </span>
                    )}
                    {record.price_per_kg && (
                      <span className="text-xs text-gray-400">
                        @ {formatCurrency(Number(record.price_per_kg), currency)}/kg
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
