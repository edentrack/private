import { useState } from 'react';
import {
  X,
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  DollarSign,
  Play,
  FileText
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/currency';

interface PayrollItem {
  worker_id: string;
  worker_name: string;
  worker_email: string;
  pay_type: string;
  base_pay: number;
  overtime_pay: number;
  bonus_amount: number;
  deduction_amount: number;
  net_pay: number;
  regular_hours: number;
  overtime_hours: number;
  currency: string;
}

interface CreatePayrollRunModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatePayrollRunModal({ onClose, onSuccess }: CreatePayrollRunModalProps) {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [step, setStep] = useState<'dates' | 'preview' | 'success'>('dates');
  const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(lastDay.toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [payrollRunId, setPayrollRunId] = useState<string | null>(null);
  const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);

  const handleGeneratePreview = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.rpc('create_payroll_run', {
        p_farm_id: currentFarm.id,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; payroll_run_id?: string; total_amount?: number; total_workers?: number };

      if (!result.success) {
        throw new Error(result.error || 'Failed to create payroll run');
      }

      setPayrollRunId(result.payroll_run_id || null);
      setTotalAmount(result.total_amount || 0);

      const { data: itemsData, error: itemsError } = await supabase
        .from('payroll_items')
        .select('*')
        .eq('payroll_run_id', result.payroll_run_id);

      if (itemsError) throw itemsError;

      setPayrollItems(itemsData || []);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to generate payroll preview');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayroll = async () => {
    if (!payrollRunId) return;

    try {
      setProcessing(true);
      setError(null);

      const { data, error } = await supabase.rpc('process_payroll_run', {
        p_payroll_run_id: payrollRunId
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Failed to process payroll');
      }

      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to process payroll');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelRun = async () => {
    if (!payrollRunId) {
      onClose();
      return;
    }

    try {
      await supabase
        .from('payroll_runs')
        .update({ status: 'cancelled' })
        .eq('id', payrollRunId);

      onClose();
    } catch (err) {
      console.error('Error cancelling run:', err);
      onClose();
    }
  };

  const currency = currentFarm?.currency_code || currentFarm?.currency || 'XAF';

  const totals = payrollItems.reduce(
    (acc, item) => ({
      base_pay: acc.base_pay + item.base_pay,
      overtime_pay: acc.overtime_pay + item.overtime_pay,
      bonus_amount: acc.bonus_amount + item.bonus_amount,
      deduction_amount: acc.deduction_amount + item.deduction_amount,
      net_pay: acc.net_pay + item.net_pay,
      regular_hours: acc.regular_hours + item.regular_hours,
      overtime_hours: acc.overtime_hours + item.overtime_hours
    }),
    { base_pay: 0, overtime_pay: 0, bonus_amount: 0, deduction_amount: 0, net_pay: 0, regular_hours: 0, overtime_hours: 0 }
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {step === 'dates' && t('payroll.create_pay_run')}
                {step === 'preview' && t('payroll.review_payroll')}
                {step === 'success' && t('payroll.payroll_processed')}
              </h2>
              <p className="text-sm text-gray-500">
                {step === 'dates' && t('payroll.select_pay_period_dates')}
                {step === 'preview' && `${payrollItems.length} ${t('payroll.workers')}`}
                {step === 'success' && t('payroll.all_payments_recorded')}
              </p>
            </div>
          </div>
          <button onClick={handleCancelRun} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'dates' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('payroll.start_date')}</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('payroll.end_date')}</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="font-semibold text-blue-900 mb-2">{t('payroll.what_happens_next')}</h4>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li>1. {t('payroll.system_calculates_pay')}</li>
                  <li>2. {t('payroll.pending_bonuses_included')}</li>
                  <li>3. {t('payroll.review_before_processing')}</li>
                  <li>4. {t('payroll.processing_creates_stubs')}</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">{t('payroll.workers')}</p>
                  <p className="text-2xl font-bold text-gray-900">{payrollItems.length}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <p className="text-sm text-emerald-600 mb-1">{t('payroll.total_bonuses')}</p>
                  <p className="text-2xl font-bold text-emerald-700">+{formatCurrency(totals.bonus_amount, currency)}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-xl">
                  <p className="text-sm text-red-600 mb-1">{t('payroll.total_deductions')}</p>
                  <p className="text-2xl font-bold text-red-700">-{formatCurrency(totals.deduction_amount, currency)}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl text-white">
                  <p className="text-sm text-emerald-100 mb-1">{t('payroll.net_payroll')}</p>
                  <p className="text-2xl font-bold">{formatCurrency(totals.net_pay, currency)}</p>
                </div>
              </div>

              {payrollItems.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-xl">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-1">{t('payroll.no_workers_to_pay')}</p>
                  <p className="text-sm text-gray-400">{t('payroll.make_sure_compensation_set')}</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.worker')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.adjustment_type')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payroll.base')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payroll.ot')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payroll.bonus')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payroll.deduct')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payroll.net')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payrollItems.map((item) => (
                        <tr key={item.worker_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 text-sm">{item.worker_name}</p>
                            <p className="text-xs text-gray-500">{item.worker_email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.pay_type === 'hourly' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {item.pay_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {formatCurrency(item.base_pay, item.currency)}
                            {item.pay_type === 'hourly' && (
                              <span className="block text-xs text-gray-500">{item.regular_hours.toFixed(1)}hrs</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {item.overtime_pay > 0 ? (
                              <>
                                {formatCurrency(item.overtime_pay, item.currency)}
                                <span className="block text-xs text-gray-500">{item.overtime_hours.toFixed(1)}hrs</span>
                              </>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-emerald-600 text-right">
                            {item.bonus_amount > 0 ? `+${formatCurrency(item.bonus_amount, item.currency)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-red-600 text-right">
                            {item.deduction_amount > 0 ? `-${formatCurrency(item.deduction_amount, item.currency)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                            {formatCurrency(item.net_pay, item.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-900">{t('payroll.totals')}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                          {formatCurrency(totals.base_pay, currency)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                          {formatCurrency(totals.overtime_pay, currency)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-600 text-right">
                          +{formatCurrency(totals.bonus_amount, currency)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-600 text-right">
                          -{formatCurrency(totals.deduction_amount, currency)}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          {formatCurrency(totals.net_pay, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('payroll.payroll_processed')}!</h3>
              <p className="text-gray-600 mb-4">
                {payrollItems.length} {payrollItems.length !== 1 ? t('payroll.workers') : t('payroll.worker')} {t('payroll.paid')} {t('common.total')} {formatCurrency(totals.net_pay, currency)}
              </p>
              <p className="text-sm text-gray-500">{t('payroll.pay_stubs_generated')}</p>
            </div>
          )}
        </div>

        {step !== 'success' && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-between">
            <button
              onClick={handleCancelRun}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <div className="flex gap-3">
              {step === 'preview' && (
                <button
                  onClick={() => setStep('dates')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  {t('common.back')}
                </button>
              )}
              {step === 'dates' && (
                <button
                  onClick={handleGeneratePreview}
                  disabled={loading || !startDate || !endDate}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('payroll.generating')}
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      {t('payroll.generate_preview')}
                    </>
                  )}
                </button>
              )}
              {step === 'preview' && payrollItems.length > 0 && (
                <button
                  onClick={handleProcessPayroll}
                  disabled={processing}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('payroll.processing_payroll')}
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {t('payroll.process_payroll')}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
