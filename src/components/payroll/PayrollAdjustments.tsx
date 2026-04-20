import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Gift,
  MinusCircle,
  X,
  Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/currency';

interface Adjustment {
  id: string;
  worker_id: string;
  worker_name?: string;
  type: 'bonus' | 'deduction';
  category: string;
  amount: number;
  description: string;
  effective_date: string;
  recurring: boolean;
  recurring_frequency: string | null;
  end_date: string | null;
  is_applied: boolean;
  created_at: string;
}

interface Worker {
  user_id: string;
  full_name: string;
}

const CATEGORIES = {
  bonus: [
    { value: 'performance_bonus', label: 'Performance Bonus' },
    { value: 'attendance_bonus', label: 'Attendance Bonus' },
    { value: 'overtime_bonus', label: 'Overtime Bonus' },
    { value: 'housing', label: 'Housing Allowance' },
    { value: 'transport', label: 'Transport Allowance' },
    { value: 'meal', label: 'Meal Allowance' },
    { value: 'other', label: 'Other Bonus' }
  ],
  deduction: [
    { value: 'advance', label: 'Salary Advance' },
    { value: 'loan_repayment', label: 'Loan Repayment' },
    { value: 'absence', label: 'Absence' },
    { value: 'damage', label: 'Damage/Loss' },
    { value: 'tax', label: 'Tax' },
    { value: 'other', label: 'Other Deduction' }
  ]
};

export function PayrollAdjustments() {
  const { currentFarm } = useAuth();
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'bonus' | 'deduction'>('all');
  const [filterApplied, setFilterApplied] = useState<'all' | 'pending' | 'applied'>('pending');

  const [formData, setFormData] = useState({
    worker_id: '',
    type: 'bonus' as 'bonus' | 'deduction',
    category: '',
    amount: '',
    description: '',
    effective_date: new Date().toISOString().split('T')[0],
    recurring: false,
    recurring_frequency: '',
    end_date: ''
  });

  useEffect(() => {
    if (currentFarm?.id) {
      loadData();
    }
  }, [currentFarm?.id, filterType, filterApplied]);

  useEffect(() => {
    if (showModal && currentFarm?.id && workers.length === 0) {
      loadWorkers();
    }
  }, [showModal]);

  const loadWorkers = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data: workersResult, error: workersError } = await supabase.rpc('get_farm_members_with_emails', {
        p_farm_id: currentFarm.id
      });

      if (workersError) {
        console.error('Error loading workers:', workersError);
      } else if (workersResult) {
        const activeWorkers = workersResult
          .filter((m: any) => m.is_active && ['worker', 'manager'].includes(m.role))
          .map((m: any) => ({ user_id: m.user_id, full_name: m.full_name }));
        setWorkers(activeWorkers);
      }
    } catch (err) {
      console.error('Error loading workers:', err);
    }
  };

  const loadData = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoading(true);

      await Promise.all([loadAdjustments(), loadWorkers()]);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAdjustments = async () => {
    if (!currentFarm?.id) return;

    let query = supabase
      .from('payroll_adjustments')
      .select(`
        *,
        profiles:worker_id (full_name)
      `)
      .eq('farm_id', currentFarm.id)
      .order('created_at', { ascending: false });

    if (filterType !== 'all') {
      query = query.eq('type', filterType);
    }

    if (filterApplied === 'pending') {
      query = query.eq('is_applied', false);
    } else if (filterApplied === 'applied') {
      query = query.eq('is_applied', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    const formattedAdjustments = (data || []).map(adj => ({
      ...adj,
      worker_name: Array.isArray(adj.profiles) ? adj.profiles[0]?.full_name : adj.profiles?.full_name
    }));

    setAdjustments(formattedAdjustments);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFarm?.id) return;

    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase.from('payroll_adjustments').insert({
        farm_id: currentFarm.id,
        worker_id: formData.worker_id,
        type: formData.type,
        category: formData.category,
        amount: parseFloat(formData.amount),
        description: formData.description,
        effective_date: formData.effective_date,
        recurring: formData.recurring,
        recurring_frequency: formData.recurring ? formData.recurring_frequency : null,
        end_date: formData.recurring && formData.end_date ? formData.end_date : null,
        created_by: (await supabase.auth.getUser()).data.user?.id
      });

      if (error) throw error;

      setSuccess('Adjustment added successfully');
      setShowModal(false);
      resetForm();
      loadAdjustments();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add adjustment');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this adjustment?')) return;

    try {
      const { error } = await supabase
        .from('payroll_adjustments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSuccess('Adjustment deleted');
      loadAdjustments();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete adjustment');
    }
  };

  const resetForm = () => {
    setFormData({
      worker_id: '',
      type: 'bonus',
      category: '',
      amount: '',
      description: '',
      effective_date: new Date().toISOString().split('T')[0],
      recurring: false,
      recurring_frequency: '',
      end_date: ''
    });
  };

  const getCategoryLabel = (type: string, category: string) => {
    const categories = CATEGORIES[type as keyof typeof CATEGORIES];
    return categories?.find(c => c.value === category)?.label || category;
  };

  const currency = currentFarm?.currency_code || currentFarm?.currency || 'XAF';

  const totalPendingBonuses = adjustments
    .filter(a => a.type === 'bonus' && !a.is_applied)
    .reduce((sum, a) => sum + a.amount, 0);

  const totalPendingDeductions = adjustments
    .filter(a => a.type === 'deduction' && !a.is_applied)
    .reduce((sum, a) => sum + a.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Gift className="w-5 h-5" />
            </div>
            <span className="text-emerald-100 text-sm">Pending Bonuses</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalPendingBonuses, currency)}</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <MinusCircle className="w-5 h-5" />
            </div>
            <span className="text-red-100 text-sm">Pending Deductions</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totalPendingDeductions, currency)}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center justify-center">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-3 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Adjustment
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <h3 className="font-semibold text-gray-900">Adjustments</h3>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Types</option>
              <option value="bonus">Bonuses</option>
              <option value="deduction">Deductions</option>
            </select>
            <select
              value={filterApplied}
              onChange={(e) => setFilterApplied(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="pending">Pending</option>
              <option value="applied">Applied</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {adjustments.length === 0 ? (
          <div className="p-12 text-center">
            <Gift className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">No adjustments found</p>
            <p className="text-sm text-gray-400">Add bonuses or deductions for workers</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {adjustments.map((adj) => (
                  <tr key={adj.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-medium text-gray-900">{adj.worker_name || 'Unknown'}</p>
                      {adj.description && (
                        <p className="text-xs text-gray-500 truncate max-w-xs">{adj.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        adj.type === 'bonus'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {adj.type === 'bonus' ? <Gift className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />}
                        {adj.type.charAt(0).toUpperCase() + adj.type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {getCategoryLabel(adj.type, adj.category)}
                      {adj.recurring && (
                        <span className="ml-2 text-xs text-blue-600">(Recurring)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right">
                      <span className={adj.type === 'bonus' ? 'text-emerald-600' : 'text-red-600'}>
                        {adj.type === 'bonus' ? '+' : '-'}
                        {formatCurrency(adj.amount, currency)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(adj.effective_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        adj.is_applied
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {adj.is_applied ? 'Applied' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {!adj.is_applied && (
                        <button
                          onClick={() => handleDelete(adj.id)}
                          className="text-red-600 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Add Adjustment</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Worker</label>
                <select
                  value={formData.worker_id}
                  onChange={(e) => setFormData({ ...formData, worker_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="">Select worker</option>
                  {workers.length === 0 ? (
                    <option value="" disabled>No workers with compensation found</option>
                  ) : (
                    workers.map((w) => (
                      <option key={w.user_id} value={w.user_id}>{w.full_name}</option>
                    ))
                  )}
                </select>
                {workers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Set up worker compensation in Team Management first
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'bonus', category: '' })}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    formData.type === 'bonus'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Gift className={`w-6 h-6 mx-auto mb-2 ${formData.type === 'bonus' ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <p className={`font-medium ${formData.type === 'bonus' ? 'text-emerald-700' : 'text-gray-600'}`}>Bonus</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'deduction', category: '' })}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    formData.type === 'deduction'
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <MinusCircle className={`w-6 h-6 mx-auto mb-2 ${formData.type === 'deduction' ? 'text-red-600' : 'text-gray-400'}`} />
                  <p className={`font-medium ${formData.type === 'deduction' ? 'text-red-700' : 'text-gray-600'}`}>Deduction</p>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="">Select category</option>
                  {CATEGORIES[formData.type].map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  placeholder="Reason for adjustment"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Effective Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="date"
                    value={formData.effective_date}
                    onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={formData.recurring}
                  onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <label htmlFor="recurring" className="text-sm text-gray-700">Recurring adjustment</label>
              </div>

              {formData.recurring && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                    <select
                      value={formData.recurring_frequency}
                      onChange={(e) => setFormData({ ...formData, recurring_frequency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      required={formData.recurring}
                    >
                      <option value="">Select</option>
                      <option value="weekly">Weekly</option>
                      <option value="bi_weekly">Bi-Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="per_payroll">Per Payroll</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date (Optional)</label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Adding...' : 'Add Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
