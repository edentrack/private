import { useState, useEffect } from 'react';
import { DollarSign, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/currency';

interface WorkerPayRate {
  pay_type: 'hourly' | 'salary';
  hourly_rate: number | null;
  overtime_rate: number | null;
  monthly_salary: number | null;
  currency: string;
}

interface SetCompensationModalProps {
  farmId: string;
  userId: string;
  workerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SetCompensationModal({
  farmId,
  userId,
  workerName,
  onClose,
  onSuccess
}: SetCompensationModalProps) {
  const [payType, setPayType] = useState<'hourly' | 'salary'>('hourly');
  const [hourlyRate, setHourlyRate] = useState('');
  const [overtimeRate, setOvertimeRate] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPayRate, setCurrentPayRate] = useState<WorkerPayRate | null>(null);

  useEffect(() => {
    loadCurrentPayRate();
  }, [farmId, userId]);

  useEffect(() => {
    if (hourlyRate && !overtimeRate) {
      const rate = parseFloat(hourlyRate);
      if (!isNaN(rate)) {
        setOvertimeRate((rate * 1.5).toFixed(2));
      }
    }
  }, [hourlyRate]);

  const loadCurrentPayRate = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('worker_pay_rates')
        .select('*')
        .eq('farm_id', farmId)
        .eq('user_id', userId)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentPayRate(data);
        setPayType(data.pay_type);
        setCurrency(data.currency);

        if (data.pay_type === 'hourly') {
          setHourlyRate(data.hourly_rate?.toString() || '');
          setOvertimeRate(data.overtime_rate?.toString() || '');
        } else {
          setMonthlySalary(data.monthly_salary?.toString() || '');
        }
      }
    } catch (err: any) {
      console.error('Error loading pay rate:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      setSaving(true);

      const params: any = {
        p_farm_id: farmId,
        p_user_id: userId,
        p_pay_type: payType,
        p_currency: currency
      };

      if (payType === 'hourly') {
        const rate = parseFloat(hourlyRate);
        if (isNaN(rate) || rate <= 0) {
          setError('Please enter a valid hourly rate');
          return;
        }
        params.p_hourly_rate = rate;

        if (overtimeRate) {
          const otRate = parseFloat(overtimeRate);
          if (!isNaN(otRate) && otRate > 0) {
            params.p_overtime_rate = otRate;
          }
        }
      } else {
        const salary = parseFloat(monthlySalary);
        if (isNaN(salary) || salary <= 0) {
          setError('Please enter a valid monthly salary');
          return;
        }
        params.p_monthly_salary = salary;
      }

      const { data, error } = await supabase.rpc('set_worker_compensation', params);

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        throw new Error(result.error || 'Failed to set compensation');
      }

      setSuccess(result.message || 'Compensation updated successfully');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error setting compensation:', err);
      setError(err.message || 'Failed to set compensation');
    } finally {
      setSaving(false);
    }
  };

  const handlePayTypeChange = (newPayType: 'hourly' | 'salary') => {
    setPayType(newPayType);
    setError(null);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4">
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Set Compensation</h2>
              <p className="text-sm text-gray-600">{workerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {currentPayRate && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-medium text-blue-900 mb-1">Current Compensation</p>
            {currentPayRate.pay_type === 'hourly' ? (
              <p className="text-sm text-blue-800">
                Hourly: {formatCurrency(currentPayRate.hourly_rate || 0, currentPayRate.currency)}
                /hr (OT: {formatCurrency(currentPayRate.overtime_rate || 0, currentPayRate.currency)}/hr)
              </p>
            ) : (
              <p className="text-sm text-blue-800">
                Salary: {formatCurrency(currentPayRate.monthly_salary || 0, currentPayRate.currency)}/month
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-xl flex items-center gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pay Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handlePayTypeChange('hourly')}
                className={`px-4 py-3 rounded-xl border-2 transition-all ${
                  payType === 'hourly'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">Hourly</div>
                <div className="text-xs mt-1">Paid by the hour</div>
              </button>
              <button
                type="button"
                onClick={() => handlePayTypeChange('salary')}
                className={`px-4 py-3 rounded-xl border-2 transition-all ${
                  payType === 'salary'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">Salary</div>
                <div className="text-xs mt-1">Fixed monthly</div>
              </button>
            </div>
          </div>

          {payType === 'hourly' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hourly Rate ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="2500.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Overtime Rate ({currency})
                  <span className="text-gray-500 font-normal ml-1">(Optional, auto-calculated at 1.5x)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={overtimeRate}
                  onChange={(e) => setOvertimeRate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="3750.00"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monthly Salary ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="300000.00"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="XAF">XAF (Central African CFA Franc)</option>
              <option value="USD">USD (US Dollar)</option>
              <option value="EUR">EUR (Euro)</option>
              <option value="GBP">GBP (British Pound)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Compensation'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
