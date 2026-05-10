import { useState, useEffect, useCallback } from 'react';
import { Plus, Stethoscope, Calendar, User, Pill, AlertCircle, Trash2, Edit2, X, Check, ChevronDown, ChevronUp, ScanLine } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useOfflineWrite } from '../../hooks/useOfflineWrite';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { useLanguage } from '../../contexts/LanguageContext';
import { todayLocal } from '../../utils/dateUtils';
import { Capacitor } from '@capacitor/core';
import { scanBarcode, tapLight } from '../../lib/capacitorNative';

interface VetLog {
  id: string;
  farm_id: string;
  flock_id: string | null;
  visit_date: string;
  vet_name: string | null;
  diagnosis: string | null;
  medication: string | null;
  dosage: string | null;
  withdrawal_period_days: number | null;
  notes: string | null;
  created_at: string;
  flocks?: { name: string } | null;
}

interface Flock {
  id: string;
  name: string;
}

const emptyForm = {
  visit_date: todayLocal(),
  flock_id: '',
  vet_name: '',
  diagnosis: '',
  medication: '',
  dosage: '',
  withdrawal_period_days: '',
  notes: '',
};

export function VetLog() {
  const { currentFarm, profile } = useAuth();
  const { tryWrite, isNetworkError } = useOfflineWrite();
  const toast = useToast();
  const farmSpecies = useFarmSpecies();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [logs, setLogs] = useState<VetLog[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vet_logs')
      .select('*, flocks(name)')
      .eq('farm_id', currentFarm.id)
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false });
    setLogs(data || []);
    setLoading(false);
  }, [currentFarm?.id]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!currentFarm?.id) return;
    supabase
      .from('flocks')
      .select('id, name')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => setFlocks(data || []));
  }, [currentFarm?.id]);

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (log: VetLog) => {
    setForm({
      visit_date: log.visit_date,
      flock_id: log.flock_id || '',
      vet_name: log.vet_name || '',
      diagnosis: log.diagnosis || '',
      medication: log.medication || '',
      dosage: log.dosage || '',
      withdrawal_period_days: log.withdrawal_period_days?.toString() || '',
      notes: log.notes || '',
    });
    setEditingId(log.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); };

  /**
   * Parse a vaccine vial QR/barcode and pre-fill whatever we can.
   *
   * Most vaccine vials use GS1 DataMatrix with these AIs:
   *   (01) GTIN, (10) batch/lot, (17) expiry YYMMDD, (21) serial
   *
   * We do a best-effort regex pull. If the scan is just a free-form
   * string (most common in our markets — local-printed QR codes encode
   * the batch number directly), we drop it into the notes field with a
   * "Scanned:" prefix so the farmer can clean it up.
   */
  const handleScanVaccine = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error(isFr ? 'Le scan est disponible uniquement sur mobile' : 'Barcode scanning is mobile-only');
      return;
    }
    const raw = await scanBarcode();
    if (!raw) {
      // User cancelled or denied camera. Don't beep — silent return is friendlier.
      return;
    }
    await tapLight();

    // Try to pull a GS1 expiry (17 + YYMMDD) out of the string.
    const expiryMatch = raw.match(/(?<![\d])17(\d{6})(?![\d])/);
    let withdrawalDays: string | undefined;
    if (expiryMatch) {
      const yy = parseInt(expiryMatch[1].slice(0, 2));
      const mm = parseInt(expiryMatch[1].slice(2, 4)) - 1;
      const dd = parseInt(expiryMatch[1].slice(4, 6));
      const year = 2000 + yy;
      const expiry = new Date(year, mm, dd);
      const visit = new Date(form.visit_date);
      const days = Math.max(0, Math.round((expiry.getTime() - visit.getTime()) / 86400000));
      // Only suggest a withdrawal if expiry is reasonable (< 5 years out).
      if (days > 0 && days < 365 * 5) withdrawalDays = String(Math.min(days, 30));
    }

    // GS1 batch (10) — variable length, runs to end-of-string or to next AI.
    const batchMatch = raw.match(/(?<![\d])10([A-Z0-9]+?)(?:17\d{6}|21|$)/i);
    const batch = batchMatch?.[1];

    setForm(prev => ({
      ...prev,
      // If medication is empty, dump the scan there so the farmer sees
      // *something* immediately and knows the scan worked.
      medication: prev.medication || (batch ? `Batch ${batch}` : raw),
      // Append scan metadata to notes without clobbering existing notes.
      notes: prev.notes
        ? `${prev.notes}\n\n[Scanned] ${raw}`
        : `[Scanned] ${raw}`,
      withdrawal_period_days: prev.withdrawal_period_days || withdrawalDays || '',
    }));
    toast.success(isFr ? 'Code scanné - vérifiez les champs pré-remplis' : 'Scan captured - verify the pre-filled fields');
  };

  // Native-only flag drives whether we render the scan button. On web
  // we hide it entirely (the helper would just toast an error).
  const isNative = Capacitor.isNativePlatform();

  const handleSave = async () => {
    if (!currentFarm?.id || !profile?.id) return;
    setSaving(true);
    try {
      const payload = {
        farm_id: currentFarm.id,
        flock_id: form.flock_id || null,
        visit_date: form.visit_date,
        vet_name: form.vet_name || null,
        diagnosis: form.diagnosis || null,
        medication: form.medication || null,
        dosage: form.dosage || null,
        withdrawal_period_days: form.withdrawal_period_days ? parseInt(form.withdrawal_period_days) : null,
        notes: form.notes || null,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from('vet_logs').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success(isFr ? 'Journal vétérinaire mis à jour' : 'Vet log updated');
      } else {
        const { error } = await supabase.from('vet_logs').insert(payload);
        if (error) {
          if (isNetworkError(error)) {
            await tryWrite('vet_logs', 'insert', payload);
            toast.success(isFr ? 'Journal vétérinaire en file d\'attente - synchronisation en ligne' : 'Vet log queued - will sync when online');
          } else {
            throw error;
          }
        } else {
          toast.success(isFr ? 'Journal vétérinaire enregistré' : 'Vet log saved');
        }
      }
      closeForm();
      loadLogs();
    } catch (err: any) {
      toast.error(err.message || (isFr ? 'Échec de l\'enregistrement' : 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(isFr ? 'Supprimer cette entrée de journal vétérinaire ?' : 'Delete this vet log entry?')) return;
    const { error } = await supabase.from('vet_logs').delete().eq('id', id);
    if (error) { toast.error(isFr ? 'Échec de la suppression' : 'Failed to delete'); return; }
    toast.success(isFr ? 'Supprimé' : 'Deleted');
    setLogs(prev => prev.filter(l => l.id !== id));
  };

  const isWithdrawalActive = (log: VetLog) => {
    if (!log.withdrawal_period_days || !log.visit_date) return false;
    const clearDate = new Date(log.visit_date);
    clearDate.setDate(clearDate.getDate() + log.withdrawal_period_days);
    return clearDate > new Date();
  };

  const withdrawalClearDate = (log: VetLog) => {
    if (!log.withdrawal_period_days || !log.visit_date) return null;
    const d = new Date(log.visit_date);
    d.setDate(d.getDate() + log.withdrawal_period_days);
    return d;
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-[#3D5F42]" />
            {isFr ? 'Journal Vétérinaire' : 'Veterinary Log'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">{isFr ? 'Suivez les visites vétérinaires, diagnostics et délais de retrait des médicaments' : 'Track vet visits, diagnoses & medication withdrawal periods'}</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-[#3D5F42] text-white px-4 py-2.5 rounded-xl hover:bg-[#2F4A34] transition-colors text-sm font-semibold shadow"
        >
          <Plus className="w-4 h-4" />
          {isFr ? 'Ajouter une visite' : 'Add Visit'}
        </button>
      </div>

      {/* Active withdrawal warnings */}
      {logs.filter(isWithdrawalActive).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
          <p className="text-amber-800 font-semibold text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {isFr
              ? `Délais de retrait actifs - ne pas vendre ${farmSpecies.id === 'poultry' ? "d'œufs ou d'animaux" : `de ${farmSpecies.animalTermPlural.toLowerCase()}`} avant la date de levée`
              : `Active withdrawal periods - do not sell ${farmSpecies.id === 'poultry' ? 'eggs or birds' : farmSpecies.animalTermPlural.toLowerCase()} until clear date`}
          </p>
          {logs.filter(isWithdrawalActive).map(log => {
            const clear = withdrawalClearDate(log);
            return (
              <p key={log.id} className="text-amber-700 text-sm pl-6">
                {log.medication || log.diagnosis || (isFr ? 'Médicament' : 'Medication')} {log.flocks?.name ? `(${log.flocks.name})` : ''} - {isFr ? 'levée le' : 'clear on'} <strong>{clear?.toLocaleDateString(isFr ? 'fr' : 'en', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
              </p>
            );
          })}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">{editingId ? (isFr ? 'Modifier la visite vétérinaire' : 'Edit Vet Visit') : (isFr ? 'Enregistrer une visite vétérinaire' : 'Log Vet Visit')}</h2>
              <button onClick={closeForm}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{isFr ? 'Date de visite *' : 'Visit Date *'}</label>
                  <input type="date" value={form.visit_date} onChange={e => setForm(p => ({ ...p, visit_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{farmSpecies.groupTerm}</label>
                  <select value={form.flock_id} onChange={e => setForm(p => ({ ...p, flock_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]">
                    <option value="">{isFr ? 'Tous / Général' : 'All / General'}</option>
                    {flocks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{isFr ? 'Nom du vétérinaire' : 'Vet Name'}</label>
                <input type="text" value={form.vet_name} onChange={e => setForm(p => ({ ...p, vet_name: e.target.value }))}
                  placeholder="Dr. Amadou" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{isFr ? 'Diagnostic / Condition' : 'Diagnosis / Condition'}</label>
                <input type="text" value={form.diagnosis} onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))}
                  placeholder="e.g. Newcastle disease, Coccidiosis" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
              </div>

              {/* Scan QR / barcode on the vaccine vial. We try to pull
                  the batch number and expiry out of GS1 DataMatrix
                  encoding, but the raw scan also drops into Notes so
                  nothing is lost. Mobile-only (camera APIs). */}
              {isNative && (
                <button
                  type="button"
                  onClick={handleScanVaccine}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-[#3D5F42]/30 text-[#3D5F42] rounded-lg text-sm font-semibold hover:bg-[#3D5F42]/5 transition-colors"
                >
                  <ScanLine className="w-4 h-4" />
                  {isFr ? "Scanner le QR code du vaccin" : 'Scan vaccine QR / barcode'}
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{isFr ? 'Médicament' : 'Medication'}</label>
                  <input type="text" value={form.medication} onChange={e => setForm(p => ({ ...p, medication: e.target.value }))}
                    placeholder="e.g. Oxytetracycline" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Dosage</label>
                  <input type="text" value={form.dosage} onChange={e => setForm(p => ({ ...p, dosage: e.target.value }))}
                    placeholder="e.g. 1ml/L water × 5 days" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{isFr ? 'Délai de retrait (jours)' : 'Withdrawal Period (days)'}</label>
                <input type="number" min="0" value={form.withdrawal_period_days} onChange={e => setForm(p => ({ ...p, withdrawal_period_days: e.target.value }))}
                  placeholder={isFr ? '0 = aucun' : '0 = none'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <p className="text-xs text-gray-400 mt-1">
                  {isFr
                    ? (farmSpecies.id === 'poultry'
                      ? 'Jours après le dernier traitement avant la vente des œufs/oiseaux'
                      : `Jours après le dernier traitement avant la vente des ${farmSpecies.animalTermPlural.toLowerCase()}`)
                    : (farmSpecies.id === 'poultry'
                      ? 'Days after last treatment before eggs/birds can be sold'
                      : `Days after last treatment before ${farmSpecies.animalTermPlural.toLowerCase()} can be sold`)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder={isFr ? 'Observations supplémentaires, instructions de suivi...' : 'Additional observations, follow-up instructions...'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42] resize-none" />
              </div>

              <button onClick={handleSave} disabled={saving || !form.visit_date}
                className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#2F4A34] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {isFr ? 'Enregistrement…' : 'Saving…'}</> : <><Check className="w-4 h-4" /> {isFr ? 'Enregistrer la visite' : 'Save Visit'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Stethoscope className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{isFr ? 'Aucune visite vétérinaire enregistrée pour le moment' : 'No vet visits recorded yet'}</p>
          <p className="text-sm mt-1">{isFr ? 'Appuyez sur "Ajouter une visite" pour enregistrer votre première entrée' : 'Tap "Add Visit" to log your first entry'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => {
            const withdrawalActive = isWithdrawalActive(log);
            const clearDate = withdrawalClearDate(log);
            const isExpanded = expandedId === log.id;

            return (
              <div key={log.id} className={`bg-white border rounded-xl overflow-hidden ${withdrawalActive ? 'border-amber-300' : 'border-gray-100'}`}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(log.visit_date).toLocaleDateString(isFr ? 'fr' : 'en', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {log.flocks?.name && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{log.flocks.name}</span>
                        )}
                        {withdrawalActive && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            ⚠ {isFr ? `Retrait jusqu'au ${clearDate?.toLocaleDateString('fr', { day: 'numeric', month: 'short' })}` : `Withdrawal until ${clearDate?.toLocaleDateString('en', { day: 'numeric', month: 'short' })}`}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 mt-1 truncate">{log.diagnosis || log.medication || (isFr ? 'Visite générale' : 'General visit')}</p>
                      {log.vet_name && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3" />{log.vet_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-2">
                    {log.medication && (
                      <div className="flex items-start gap-2">
                        <Pill className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-xs font-semibold text-gray-600">{isFr ? 'Médicament : ' : 'Medication: '}</span>
                          <span className="text-sm text-gray-800">{log.medication}</span>
                          {log.dosage && <span className="text-sm text-gray-500"> - {log.dosage}</span>}
                        </div>
                      </div>
                    )}
                    {log.withdrawal_period_days != null && log.withdrawal_period_days > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                        {isFr
                          ? `Retrait : ${log.withdrawal_period_days} jours après le ${new Date(log.visit_date).toLocaleDateString('fr', { day: 'numeric', month: 'short' })}${clearDate ? ` - levée le ${clearDate.toLocaleDateString('fr', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
                          : `Withdrawal: ${log.withdrawal_period_days} days after ${new Date(log.visit_date).toLocaleDateString('en', { day: 'numeric', month: 'short' })}${clearDate ? ` - clear on ${clearDate.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`}
                      </p>
                    )}
                    {log.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{log.notes}</p>}

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => openEdit(log)}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#3D5F42] transition-colors px-3 py-1.5 border border-gray-200 rounded-lg">
                        <Edit2 className="w-3.5 h-3.5" /> {isFr ? 'Modifier' : 'Edit'}
                      </button>
                      <button onClick={() => handleDelete(log.id)}
                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors px-3 py-1.5 border border-red-100 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" /> {isFr ? 'Supprimer' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
