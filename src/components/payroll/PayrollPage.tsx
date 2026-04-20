import { useState, useEffect } from 'react';
import {
  DollarSign,
  LayoutDashboard,
  History,
  Gift,
  FileText,
  Settings,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle,
  Calendar,
  Download,
  Users,
  Edit2,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';
import { PayrollDashboard } from './PayrollDashboard';
import { PayrollAdjustments } from './PayrollAdjustments';
import { PayStubs } from './PayStubs';
import { CreatePayrollRunModal } from './CreatePayrollRunModal';
import { EditPayrollRunModal } from './EditPayrollRunModal';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';

type TabType = 'dashboard' | 'history' | 'adjustments' | 'stubs' | 'settings';

interface PayrollRun {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  total_amount: number;
  total_workers: number;
  currency: string;
  created_at: string;
  processed_at: string | null;
  approved_by: string | null;
}

interface PayrollSettings {
  hourly_pay_frequency: 'weekly' | 'bi_weekly' | 'monthly';
  hourly_pay_day: number;
  salary_auto_process: boolean;
  salary_reminder_days: number;
}

export function PayrollPage() {
  const { t } = useTranslation();
  const { currentFarm, currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isOwnerOrManager, setIsOwnerOrManager] = useState(false);
  const hideFinancials = shouldHideFinancialData(currentRole);

  const [payrollHistory, setPayrollHistory] = useState<PayrollRun[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingPayrollRun, setEditingPayrollRun] = useState<PayrollRun | null>(null);

  const [settings, setSettings] = useState<PayrollSettings>({
    hourly_pay_frequency: 'monthly',
    hourly_pay_day: 1,
    salary_auto_process: true,
    salary_reminder_days: 3
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (currentFarm?.id) {
      setIsOwnerOrManager(currentRole === 'owner' || currentRole === 'manager');
    }
  }, [currentFarm?.id, currentRole]);

  useEffect(() => {
    if (currentFarm?.id && activeTab === 'history') {
      loadPayrollHistory();
    }
  }, [currentFarm?.id, activeTab]);

  useEffect(() => {
    if (currentFarm?.id && activeTab === 'settings') {
      loadPayrollSettings();
    }
  }, [currentFarm?.id, activeTab]);

  const loadPayrollHistory = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoadingHistory(true);
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setPayrollHistory(data || []);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadPayrollSettings = async () => {
    if (!currentFarm?.id) return;
    try {
      const { data, error } = await supabase
        .from('payroll_settings')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setSettings({
          hourly_pay_frequency: data.hourly_pay_frequency,
          hourly_pay_day: data.hourly_pay_day,
          salary_auto_process: data.salary_auto_process,
          salary_reminder_days: data.salary_reminder_days
        });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const handleSaveSettings = async () => {
    if (!currentFarm?.id) return;

    try {
      setSavingSettings(true);
      const { error } = await supabase.rpc('save_payroll_settings', {
        p_farm_id: currentFarm.id,
        p_hourly_pay_frequency: settings.hourly_pay_frequency,
        p_hourly_pay_day: settings.hourly_pay_day,
        p_salary_auto_process: settings.salary_auto_process,
        p_salary_reminder_days: settings.salary_reminder_days
      });

      if (error) throw error;

      setSettingsSuccess(t('payroll.settings_saved_successfully'));
      setTimeout(() => setSettingsSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportHistory = () => {
    if (payrollHistory.length === 0) return;

    const headers = [t('payroll.period_start'), t('payroll.period_end'), t('payroll.status'), t('payroll.workers'), t('sales.total_amount'), t('common.currency'), t('payroll.processed')];
    const rows = payrollHistory.map(run => [
      run.pay_period_start,
      run.pay_period_end,
      run.status,
      run.total_workers.toString(),
      run.total_amount.toFixed(2),
      run.currency,
      run.processed_at || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payroll_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleDeletePayrollRun = async (id: string) => {
    if (!currentFarm?.id) return;

    try {
      setDeletingId(id);

      const { error } = await supabase
        .from('payroll_runs')
        .delete()
        .eq('id', id)
        .eq('farm_id', currentFarm.id);

      if (error) throw error;

      setPayrollHistory(prev => prev.filter(run => run.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Error deleting payroll run:', err);
      alert(t('payroll.failed_to_delete'));
    } finally {
      setDeletingId(null);
    }
  };

  const canEditOrDelete = (status: string) => {
    return status === 'draft' || status === 'pending_approval';
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: t('payroll.draft'), icon: <FileText className="w-3 h-3" /> },
      pending_approval: { bg: 'bg-amber-100', text: 'text-amber-700', label: t('payroll.pending'), icon: <Clock className="w-3 h-3" /> },
      approved: { bg: 'bg-blue-100', text: 'text-blue-700', label: t('payroll.approved'), icon: <CheckCircle className="w-3 h-3" /> },
      processing: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: t('payroll.processing'), icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: t('payroll.completed'), icon: <CheckCircle className="w-3 h-3" /> },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: t('payroll.cancelled'), icon: <AlertCircle className="w-3 h-3" /> }
    };
    return configs[status] || configs.draft;
  };

  const getPayDayLabel = () => {
    if (settings.hourly_pay_frequency === 'weekly') {
      const days = [
        t('payroll.sunday'),
        t('payroll.monday'),
        t('payroll.tuesday'),
        t('payroll.wednesday'),
        t('payroll.thursday'),
        t('payroll.friday'),
        t('payroll.saturday')
      ];
      return days[settings.hourly_pay_day] || t('payroll.monday');
    }
    return `${t('payroll.day')} ${settings.hourly_pay_day} ${t('payroll.of_the_month')}`;
  };

  if (!isOwnerOrManager && currentRole !== 'worker') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">{t('payroll.access_restricted')}</h3>
            <p className="text-sm text-amber-800">{t('payroll.only_owners_managers')}</p>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: t('payroll.overview'), icon: LayoutDashboard },
    { id: 'history', label: t('payroll.pay_runs'), icon: History },
    { id: 'adjustments', label: t('payroll.adjustments'), icon: Gift, hideForWorker: true },
    { id: 'stubs', label: t('payroll.pay_stubs'), icon: FileText },
    { id: 'settings', label: t('nav.settings') || 'Settings', icon: Settings, hideForWorker: true }
  ].filter(tab => !tab.hideForWorker || isOwnerOrManager);

  const currency = currentFarm?.currency_code || currentFarm?.currency || 'XAF';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <DollarSign className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t('payroll.title')}</h1>
              <p className="text-gray-500">{t('payroll.manage')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-emerald-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'dashboard' && (
        <PayrollDashboard
          onNavigate={(tab) => setActiveTab(tab as TabType)}
          onCreatePayroll={() => setShowCreateModal(true)}
        />
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-400" />
              {t('payroll.payroll_history')}
            </h3>
            {payrollHistory.length > 0 && (
              <button
                onClick={handleExportHistory}
                className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                {t('payroll.export')}
              </button>
            )}
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : payrollHistory.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-1">{t('payroll.no_payroll_runs_yet')}</p>
              <p className="text-sm text-gray-400">{t('payroll.create_first_pay_run')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.pay_period')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.status')}</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t('payroll.workers')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.total')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.processed')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payrollHistory.map((run) => {
                    const statusConfig = getStatusConfig(run.status);
                    const editable = canEditOrDelete(run.status);
                    return (
                      <tr key={run.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                              <Calendar className="w-5 h-5 text-gray-500" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {new Date(run.pay_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {t('common.date_range_separator')}
                                {new Date(run.pay_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                              <p className="text-xs text-gray-500">
                                {t('common.created')} {new Date(run.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                          {run.total_workers}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {hideFinancials ? (
                            <span className="text-gray-400 italic text-sm">{t('common.hidden') || 'Hidden'}</span>
                          ) : (
                            <p className="font-semibold text-gray-900">{formatCurrency(run.total_amount, run.currency)}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {run.processed_at ? new Date(run.processed_at).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {editable && (
                            <div className="flex items-center justify-end gap-2">
                              {confirmDeleteId === run.id ? (
                                <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
                                  <span className="text-xs text-red-700 font-medium">{t('common.delete_confirm') || 'Delete?'}</span>
                                  <button
                                    onClick={() => handleDeletePayrollRun(run.id)}
                                    disabled={deletingId === run.id}
                                    className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                                  >
                                    {deletingId === run.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      'Yes'
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={deletingId === run.id}
                                    className="text-xs text-gray-600 hover:text-gray-700 font-medium disabled:opacity-50"
                                  >
                                    {t('payroll.no')}
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setEditingPayrollRun(run)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title={t('payroll.edit_pay_run')}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(run.id)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title={t('payroll.delete_pay_run')}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'adjustments' && <PayrollAdjustments />}

      {activeTab === 'stubs' && <PayStubs />}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-blue-900 mb-2">{t('payroll.worker_compensation_setup')}</h4>
                <p className="text-blue-800 mb-4">
                  {t('payroll.before_running_payroll')}
                </p>
                <button
                  onClick={() => window.location.hash = '#/team'}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  {t('payroll.go_to_team_management')}
                </button>
                <p className="text-sm text-blue-700 mt-3">
                  {t('payroll.in_team_management')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-400" />
              {t('payroll.payroll_settings')}
            </h3>

            {settingsSuccess && (
              <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                <span>{settingsSuccess}</span>
              </div>
            )}

          <div className="space-y-6 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('payroll.hourly_pay_frequency')}</label>
              <select
                value={settings.hourly_pay_frequency}
                onChange={(e) => setSettings({ ...settings, hourly_pay_frequency: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="weekly">{t('payroll.weekly')}</option>
                <option value="bi_weekly">{t('payroll.bi_weekly')}</option>
                <option value="monthly">{t('payroll.monthly')}</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">{t('payroll.how_often_process')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {settings.hourly_pay_frequency === 'weekly' ? t('payroll.pay_day_week') : t('payroll.pay_day_month')}
              </label>
              {settings.hourly_pay_frequency === 'weekly' ? (
                <select
                  value={settings.hourly_pay_day}
                  onChange={(e) => setSettings({ ...settings, hourly_pay_day: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  {[
                    t('payroll.sunday'),
                    t('payroll.monday'),
                    t('payroll.tuesday'),
                    t('payroll.wednesday'),
                    t('payroll.thursday'),
                    t('payroll.friday'),
                    t('payroll.saturday')
                  ].map((day, i) => (
                    <option key={i} value={i}>{day}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={settings.hourly_pay_day}
                  onChange={(e) => setSettings({ ...settings, hourly_pay_day: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              )}
              <p className="text-sm text-gray-500 mt-1">{t('payroll.current')} {getPayDayLabel()}</p>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h4 className="font-medium text-gray-900 mb-4">{t('payroll.salary_settings')}</h4>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-medium text-gray-700">{t('payroll.salary_due_reminders')}</p>
                  <p className="text-sm text-gray-500">{t('payroll.get_notified_when_due')}</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, salary_auto_process: !settings.salary_auto_process })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    settings.salary_auto_process ? 'bg-emerald-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.salary_auto_process ? 'translate-x-5' : ''
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('payroll.reminder_days_before_month_end')}</label>
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={settings.salary_reminder_days}
                  onChange={(e) => setSettings({ ...settings, salary_reminder_days: parseInt(e.target.value) || 3 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  {t('payroll.reminder_days_before').replace('{days}', settings.salary_reminder_days.toString())}
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="w-full bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingSettings ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('payroll.saving')}
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  {t('payroll.save_settings')}
                </>
              )}
            </button>
          </div>
        </div>
        </div>
      )}

      {showCreateModal && (
        <CreatePayrollRunModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadPayrollHistory();
            setActiveTab('history');
          }}
        />
      )}

      {editingPayrollRun && (
        <EditPayrollRunModal
          payrollRun={editingPayrollRun}
          onClose={() => setEditingPayrollRun(null)}
          onSuccess={() => {
            loadPayrollHistory();
            setEditingPayrollRun(null);
          }}
        />
      )}
    </div>
  );
}
