import { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Plus,
  FileText,
  Clock,
  Wallet,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';

interface PayrollStats {
  this_month_total: number;
  last_month_total: number;
  ytd_total: number;
  pending_adjustments: number;
  active_workers: number;
  average_pay: number;
  month_over_month_change: number;
}

interface RecentPayroll {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  total_amount: number;
  total_workers: number;
  currency: string;
  processed_at: string | null;
}

interface PayrollDashboardProps {
  onNavigate: (tab: string) => void;
  onCreatePayroll: () => void;
}

export function PayrollDashboard({ onNavigate, onCreatePayroll }: PayrollDashboardProps) {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [stats, setStats] = useState<PayrollStats | null>(null);
  const [recentPayrolls, setRecentPayrolls] = useState<RecentPayroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    if (currentFarm?.id) {
      loadDashboardData();
    }
  }, [currentFarm?.id]);

  const loadDashboardData = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoading(true);

      const [statsResult, payrollsResult] = await Promise.all([
        supabase.rpc('get_payroll_stats', { p_farm_id: currentFarm.id }),
        supabase
          .from('payroll_runs')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      if (statsResult.data) {
        setStats(statsResult.data as PayrollStats);
      }

      if (payrollsResult.data) {
        setRecentPayrolls(payrollsResult.data);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
      pending_approval: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
      approved: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Approved' },
      processing: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Processing' },
      completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: t('payroll.cancelled') }
    };
    return configs[status] || configs.draft;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-neon-600" />
      </div>
    );
  }

  const currency = currentFarm?.currency_code || currentFarm?.currency || 'XAF';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-neon-400 to-neon-500 rounded-2xl p-5 text-gray-900 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gray-900/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-gray-900/20 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              {stats && stats.month_over_month_change !== 0 && (
                <div className={`flex items-center gap-1 text-sm ${stats.month_over_month_change > 0 ? 'text-gray-800' : 'text-red-600'}`}>
                  {stats.month_over_month_change > 0 ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {Math.abs(stats.month_over_month_change)}%
                </div>
              )}
            </div>
            <p className="text-gray-800 text-sm mb-1">{t('payroll.this_month')}</p>
            <p className="text-2xl font-bold">
              {formatCurrency(stats?.this_month_total || 0, currency)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('payroll.year_to_date')}</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(stats?.ytd_total || 0, currency)}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('payroll.active_workers')}</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.active_workers || 0}</p>
          <p className="text-xs text-gray-400 mt-1">{t('payroll.with_compensation_set')}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-cyan-600" />
            </div>
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('payroll.avg_pay_per_worker')}</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(stats?.average_pay || 0, currency)}
          </p>
        </div>
      </div>

      {stats && stats.pending_adjustments > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-amber-900">{t('payroll.pending_adjustments')}</p>
              <p className="text-sm text-amber-700">
                {stats.pending_adjustments} {stats.pending_adjustments !== 1 ? t('payroll.bonuses_deductions_waiting') : t('payroll.bonus_deduction_waiting')}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('adjustments')}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors text-sm font-medium"
          >
            {t('payroll.review')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              {t('payroll.recent_pay_runs')}
            </h3>
            <button
              onClick={onCreatePayroll}
              className="flex items-center gap-2 px-3 py-1.5 bg-neon-500 text-gray-900 rounded-lg hover:bg-neon-400 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              {t('payroll.new_pay_run')}
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentPayrolls.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-1">{t('payroll.no_payroll_runs_yet')}</p>
                <p className="text-sm text-gray-400">{t('payroll.create_first_pay_run')}</p>
              </div>
            ) : (
              recentPayrolls.map((payroll) => {
                const statusConfig = getStatusConfig(payroll.status);
                return (
                  <div key={payroll.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                          <FileText className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {new Date(payroll.pay_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {t('common.date_range_separator')}
                            {new Date(payroll.pay_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <p className="text-sm text-gray-500">
                            {payroll.total_workers} {payroll.total_workers !== 1 ? t('payroll.workers') : t('payroll.worker')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                          {statusConfig.label}
                        </span>
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(payroll.total_amount, payroll.currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {recentPayrolls.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100">
              <button
                onClick={() => onNavigate('history')}
                className="text-neon-600 hover:text-neon-700 text-sm font-medium"
              >
                {t('payroll.view_all_pay_runs')}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gray-400" />
              {t('payroll.quick_actions')}
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <button
              onClick={onCreatePayroll}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-neon-50 border border-gray-100 hover:border-neon-200 transition-all group"
            >
              <div className="w-10 h-10 bg-neon-100 rounded-lg flex items-center justify-center group-hover:bg-neon-200 transition-colors">
                <Plus className="w-5 h-5 text-neon-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">{t('payroll.create_pay_run')}</p>
                <p className="text-xs text-gray-500">{t('payroll.generate_new_payroll')}</p>
              </div>
            </button>

            <button
              onClick={() => onNavigate('adjustments')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 border border-gray-100 hover:border-blue-200 transition-all group"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">{t('payroll.add_adjustment')}</p>
                <p className="text-xs text-gray-500">{t('payroll.bonus_or_deduction')}</p>
              </div>
            </button>

            <button
              onClick={() => onNavigate('stubs')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-cyan-50 border border-gray-100 hover:border-cyan-200 transition-all group"
            >
              <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center group-hover:bg-cyan-200 transition-colors">
                <FileText className="w-5 h-5 text-cyan-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">{t('payroll.pay_stubs')}</p>
                <p className="text-xs text-gray-500">{t('payroll.view_payment_records')}</p>
              </div>
            </button>

            <button
              onClick={() => onNavigate('settings')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-all group"
            >
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                <Clock className="w-5 h-5 text-gray-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">{t('payroll.payroll_settings')}</p>
                <p className="text-xs text-gray-500">{t('payroll.configure_pay_schedules')}</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 overflow-hidden">
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-blue-100/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900">{t('payroll.how_pay_runs_work')}</h4>
          </div>
          {showExplanation ? (
            <ChevronUp className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          )}
        </button>

        {showExplanation && (
          <div className="px-6 pb-6 space-y-3 text-sm text-gray-700">
            <p>
              {t('payroll.pay_run_explanation')}
            </p>

            <div className="bg-white/60 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                {t('payroll.set_pay_period')}
              </p>
              <p className="text-gray-600 ml-8">{t('payroll.select_dates')}</p>
            </div>

            <div className="bg-white/60 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                {t('payroll.automatic_calculation')}
              </p>
              <p className="text-gray-600 ml-8">
                {t('payroll.system_calculates')}
              </p>
              <ul className="text-gray-600 ml-8 space-y-1 list-disc list-inside">
                <li><span className="font-medium">{t('payroll.hourly_workers')}</span> {t('payroll.hours_worked_rate')}</li>
                <li><span className="font-medium">{t('payroll.salaried_workers')}</span> {t('payroll.pro_rated_salary')}</li>
                <li><span className="font-medium">{t('payroll.adjustments')}</span> {t('payroll.add_bonuses_deductions')}</li>
              </ul>
            </div>

            <div className="bg-white/60 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                {t('payroll.review_and_process')}
              </p>
              <p className="text-gray-600 ml-8">{t('payroll.review_approve')}</p>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-900 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{t('payroll.ensure_shifts_recorded')}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
