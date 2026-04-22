import { useState, useEffect, useCallback } from 'react';
import { Plus, Stethoscope, Calendar, User, Pill, AlertCircle, Trash2, Edit2, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

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
  visit_date: new Date().toISOString().split('T')[0],
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
  const toast = useToast();
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
        toast.success('Vet log updated');
      } else {
        const { error } = await supabase.from('vet_logs').insert(payload);
        if (error) throw error;
        toast.success('Vet log saved');
      }
      closeForm();
      loadLogs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vet log entry?')) return;
    const { error } = await supabase.from('vet_logs').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Deleted');
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
            Veterinary Log
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Track vet visits, diagnoses & medication withdrawal periods</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-[#3D5F42] text-white px-4 py-2.5 rounded-xl hover:bg-[#2F4A34] transition-colors text-sm font-semibold shadow"
        >
          <Plus className="w-4 h-4" />
          Add Visit
        </button>
      </div>

      {/* Active withdrawal warnings */}
      {logs.filter(isWithdrawalActive).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
          <p className="text-amber-800 font-semibold text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Active withdrawal periods — do not sell eggs or birds until clear date
          </p>
          {logs.filter(isWithdrawalActive).map(log => {
            const clear = withdrawalClearDate(log);
            return (
              <p key={log.id} className="text-amber-700 text-sm pl-6">
                {log.medication || log.diagnosis || 'Medication'} {log.flocks?.name ? `(${log.flocks.name})` : ''} — clear on <strong>{clear?.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
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
              <h2 className="font-bold text-gray-900">{editingId ? 'Edit Vet Visit' : 'Log Vet Visit'}</h2>
              <button onClick={closeForm}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Visit Date *</label>
                  <input type="date" value={form.visit_date} onChange={e => setForm(p => ({ ...p, visit_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Flock</label>
                  <select value={form.flock_id} onChange={e => setForm(p => ({ ...p, flock_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]">
                    <option value="">All / General</option>
                    {flocks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Vet Name</label>
                <input type="text" value={form.vet_name} onChange={e => setForm(p => ({ ...p, vet_name: e.target.value }))}
                  placeholder="Dr. Amadou" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Diagnosis / Condition</label>
                <input type="text" value={form.diagnosis} onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))}
                  placeholder="e.g. Newcastle disease, Coccidiosis" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Medication</label>
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
                <label className="block text-xs font-semibold text-gray-600 mb-1">Withdrawal Period (days)</label>
                <input type="number" min="0" value={form.withdrawal_period_days} onChange={e => setForm(p => ({ ...p, withdrawal_period_days: e.target.value }))}
                  placeholder="0 = none" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <p className="text-xs text-gray-400 mt-1">Days after last treatment before eggs/birds can be sold</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Additional observations, follow-up instructions..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3D5F42] resize-none" />
              </div>

              <button onClick={handleSave} disabled={saving || !form.visit_date}
                className="w-full bg-[#3D5F42] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#2F4A34] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save Visit</>}
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
          <p className="font-medium">No vet visits recorded yet</p>
          <p className="text-sm mt-1">Tap "Add Visit" to log your first entry</p>
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
                          {new Date(log.visit_date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {log.flocks?.name && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{log.flocks.name}</span>
                        )}
                        {withdrawalActive && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            ⚠ Withdrawal until {clearDate?.toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 mt-1 truncate">{log.diagnosis || log.medication || 'General visit'}</p>
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
                          <span className="text-xs font-semibold text-gray-600">Medication: </span>
                          <span className="text-sm text-gray-800">{log.medication}</span>
                          {log.dosage && <span className="text-sm text-gray-500"> — {log.dosage}</span>}
                        </div>
                      </div>
                    )}
                    {log.withdrawal_period_days != null && log.withdrawal_period_days > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                        Withdrawal: {log.withdrawal_period_days} days after {new Date(log.visit_date).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                        {clearDate ? ` — clear on ${clearDate.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      </p>
                    )}
                    {log.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{log.notes}</p>}

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => openEdit(log)}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#3D5F42] transition-colors px-3 py-1.5 border border-gray-200 rounded-lg">
                        <Edit2 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleDelete(log.id)}
                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors px-3 py-1.5 border border-red-100 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
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
