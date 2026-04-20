import { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Eye,
  Loader2,
  Calendar,
  Search,
  X,
  Clock,
  DollarSign,
  Gift,
  MinusCircle,
  Printer,
  Send,
  Mail,
  Share2
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';

interface PayStub {
  id: string;
  stub_number: string;
  worker_id: string;
  pay_period_start: string;
  pay_period_end: string;
  payment_date: string;
  gross_pay: number;
  total_bonuses: number;
  total_deductions: number;
  net_pay: number;
  currency: string;
  breakdown: {
    base_pay: number;
    overtime_pay: number;
    regular_hours: number;
    overtime_hours: number;
    hourly_rate: number;
    pay_type: string;
    bonuses: Array<{ category: string; amount: number; description: string }>;
    deductions: Array<{ category: string; amount: number; description: string }>;
  };
  viewed_at: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string };
}

export function PayStubs() {
  const { t } = useTranslation();
  const { currentFarm, profile, currentRole } = useAuth();
  const [stubs, setStubs] = useState<PayStub[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStub, setSelectedStub] = useState<PayStub | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const isWorker = currentRole === 'worker';

  useEffect(() => {
    if (currentFarm?.id) {
      loadPayStubs();
    }
  }, [currentFarm?.id, dateFilter]);

  const loadPayStubs = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoading(true);

      let query = supabase
        .from('pay_stubs')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('payment_date', { ascending: false });

      if (isWorker && profile?.id) {
        query = query.eq('worker_id', profile.id);
      }

      if (dateFilter) {
        const startOfMonth = new Date(dateFilter + '-01');
        const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
        query = query
          .gte('payment_date', startOfMonth.toISOString().split('T')[0])
          .lte('payment_date', endOfMonth.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) throw error;

      const workerIds = [...new Set((data || []).map(s => s.worker_id))];
      let profilesMap: Record<string, { full_name: string; email: string }> = {};

      if (workerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', workerIds);

        if (profilesData) {
          profilesMap = profilesData.reduce((acc, p) => {
            acc[p.id] = { full_name: p.full_name || 'Unknown', email: p.email || '' };
            return acc;
          }, {} as Record<string, { full_name: string; email: string }>);
        }
      }

      const formattedStubs = (data || []).map(stub => ({
        ...stub,
        profiles: profilesMap[stub.worker_id] || { full_name: 'Unknown', email: '' }
      }));

      setStubs(formattedStubs);
    } catch (err) {
      console.error('Error loading pay stubs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewStub = async (stub: PayStub) => {
    setSelectedStub(stub);

    if (!stub.viewed_at && stub.worker_id === profile?.id) {
      await supabase
        .from('pay_stubs')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', stub.id);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadStub = (stub: PayStub) => {
    const currency = stub.currency;
    const content = `
PAY STUB
========================================
${currentFarm?.name}

Stub Number: ${stub.stub_number}
Payment Date: ${new Date(stub.payment_date).toLocaleDateString()}

EMPLOYEE INFORMATION
Employee: ${stub.profiles?.full_name}
Email: ${stub.profiles?.email}
Pay Period: ${new Date(stub.pay_period_start).toLocaleDateString()} - ${new Date(stub.pay_period_end).toLocaleDateString()}

EARNINGS
${stub.breakdown.pay_type === 'hourly' ? 'Regular Pay' : 'Base Salary'}: ${formatCurrency(stub.breakdown.base_pay, currency)}${stub.breakdown.pay_type === 'hourly' ? ` (${stub.breakdown.regular_hours.toFixed(2)} hrs)` : ''}
${stub.breakdown.overtime_pay > 0 ? `Overtime Pay: ${formatCurrency(stub.breakdown.overtime_pay, currency)} (${stub.breakdown.overtime_hours.toFixed(2)} hrs)\n` : ''}
Gross Pay: ${formatCurrency(stub.gross_pay, currency)}

${stub.breakdown.bonuses && stub.breakdown.bonuses.length > 0 ? `BONUSES & ALLOWANCES
${stub.breakdown.bonuses.map((b: any) => `${getCategoryLabel(b.category)}: +${formatCurrency(b.amount, currency)}`).join('\n')}
Total Bonuses: +${formatCurrency(stub.total_bonuses, currency)}

` : ''}${stub.breakdown.deductions && stub.breakdown.deductions.length > 0 ? `DEDUCTIONS
${stub.breakdown.deductions.map((d: any) => `${getCategoryLabel(d.category)}: -${formatCurrency(d.amount, currency)}`).join('\n')}
Total Deductions: -${formatCurrency(stub.total_deductions, currency)}

` : ''}NET PAY: ${formatCurrency(stub.net_pay, currency)}

========================================
Generated: ${new Date().toLocaleString()}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pay_stub_${stub.stub_number}_${stub.profiles?.full_name?.replace(/\s+/g, '_')}.txt`;
    link.click();
  };

  const handleSendStub = (stub: PayStub) => {
    const currency = stub.currency;
    const message = `*PAY STUB*\n\n*${currentFarm?.name}*\n\nStub #: ${stub.stub_number}\nPayment Date: ${new Date(stub.payment_date).toLocaleDateString()}\n\n*EMPLOYEE*\n${stub.profiles?.full_name}\n\n*PAY PERIOD*\n${new Date(stub.pay_period_start).toLocaleDateString()} - ${new Date(stub.pay_period_end).toLocaleDateString()}\n\n*EARNINGS*\n${stub.breakdown.pay_type === 'hourly' ? 'Regular Pay' : 'Base Salary'}: ${formatCurrency(stub.breakdown.base_pay, currency)}\n${stub.breakdown.overtime_pay > 0 ? `Overtime: ${formatCurrency(stub.breakdown.overtime_pay, currency)}\n` : ''}Gross: ${formatCurrency(stub.gross_pay, currency)}\n\n${stub.total_bonuses > 0 ? `*BONUSES*\nTotal: +${formatCurrency(stub.total_bonuses, currency)}\n\n` : ''}${stub.total_deductions > 0 ? `*DEDUCTIONS*\nTotal: -${formatCurrency(stub.total_deductions, currency)}\n\n` : ''}*NET PAY: ${formatCurrency(stub.net_pay, currency)}*`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleExportCSV = () => {
    const headers = ['Stub Number', 'Worker', 'Period', 'Gross Pay', 'Bonuses', 'Deductions', 'Net Pay', 'Payment Date'];
    const rows = stubs.map(stub => [
      stub.stub_number,
      stub.profiles?.full_name || 'Unknown',
      `${stub.pay_period_start} to ${stub.pay_period_end}`,
      stub.gross_pay.toFixed(2),
      stub.total_bonuses.toFixed(2),
      stub.total_deductions.toFixed(2),
      stub.net_pay.toFixed(2),
      stub.payment_date
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pay_stubs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredStubs = stubs.filter(stub => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      stub.stub_number.toLowerCase().includes(search) ||
      stub.profiles?.full_name?.toLowerCase().includes(search) ||
      stub.profiles?.email?.toLowerCase().includes(search)
    );
  });

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      performance_bonus: 'Performance Bonus',
      attendance_bonus: 'Attendance Bonus',
      overtime_bonus: 'Overtime Bonus',
      housing: 'Housing Allowance',
      transport: 'Transport Allowance',
      meal: 'Meal Allowance',
      advance: 'Salary Advance',
      loan_repayment: 'Loan Repayment',
      absence: 'Absence',
      damage: 'Damage/Loss',
      tax: 'Tax',
      other: 'Other'
    };
    return labels[category] || category;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            {t('payroll.pay_stubs')}
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('common.search') || 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 w-48"
              />
            </div>
            <input
              type="month"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            />
            {!isWorker && stubs.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                {t('payroll.export')}
              </button>
            )}
          </div>
        </div>

        {filteredStubs.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">{t('payroll.no_pay_stubs_found')}</p>
            <p className="text-sm text-gray-400">
              {isWorker ? t('payroll.pay_stubs_will_appear_worker') : t('payroll.process_payroll_to_generate')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.stub_number')}</th>
                  {!isWorker && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.worker')}</th>}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.period')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payroll.gross')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payroll.net_pay')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payroll.payment_date')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredStubs.map((stub) => (
                  <tr key={stub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm text-gray-900">{stub.stub_number}</span>
                    </td>
                    {!isWorker && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="font-medium text-gray-900">{stub.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{stub.profiles?.email}</p>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(stub.pay_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {t('common.date_range_separator')}
                      {new Date(stub.pay_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(stub.gross_pay, stub.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600 text-right">
                      {formatCurrency(stub.net_pay, stub.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(stub.payment_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleViewStub(stub)}
                        className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-4 h-4" />
                        {t('common.view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedStub && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:rounded-none">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between print:hidden">
              <h2 className="text-xl font-bold text-gray-900">{t('payroll.pay_stub_details')}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadStub(selectedStub)}
                  className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  <Download className="w-4 h-4" />
                  {t('common.download') || 'Download'}
                </button>
                <button
                  onClick={() => handleSendStub(selectedStub)}
                  className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  <Share2 className="w-4 h-4" />
                  {t('common.share') || 'Share'}
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  <Printer className="w-4 h-4" />
                  {t('common.print') || 'Print'}
                </button>
                <button onClick={() => setSelectedStub(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{currentFarm?.name}</p>
                  <p className="text-gray-500">{t('payroll.pay_statement')}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-semibold text-gray-900">{selectedStub.stub_number}</p>
                  <p className="text-sm text-gray-500">
                    Payment Date: {new Date(selectedStub.payment_date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Employee</p>
                  <p className="font-semibold text-gray-900">{selectedStub.profiles?.full_name}</p>
                  <p className="text-sm text-gray-600">{selectedStub.profiles?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Pay Period</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(selectedStub.pay_period_start).toLocaleDateString()} - {new Date(selectedStub.pay_period_end).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-gray-400" />
                  Earnings
                </h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {selectedStub.breakdown.pay_type === 'hourly' ? 'Regular Pay' : 'Base Salary'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">
                          {selectedStub.breakdown.pay_type === 'hourly' ? selectedStub.breakdown.regular_hours.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">
                          {selectedStub.breakdown.pay_type === 'hourly'
                            ? formatCurrency(selectedStub.breakdown.hourly_rate, selectedStub.currency)
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                          {formatCurrency(selectedStub.breakdown.base_pay, selectedStub.currency)}
                        </td>
                      </tr>
                      {selectedStub.breakdown.pay_type === 'hourly' && selectedStub.breakdown.overtime_hours > 0 && (
                        <tr>
                          <td className="px-4 py-3 text-sm text-gray-900">Overtime Pay</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">
                            {selectedStub.breakdown.overtime_hours.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">
                            {formatCurrency(selectedStub.breakdown.hourly_rate * 1.5, selectedStub.currency)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                            {formatCurrency(selectedStub.breakdown.overtime_pay, selectedStub.currency)}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-gray-50">
                        <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900">Gross Pay</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          {formatCurrency(selectedStub.gross_pay, selectedStub.currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedStub.breakdown.bonuses && selectedStub.breakdown.bonuses.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Gift className="w-5 h-5 text-emerald-500" />
                    Bonuses & Allowances
                  </h3>
                  <div className="border border-emerald-200 rounded-xl overflow-hidden bg-emerald-50/50">
                    <table className="min-w-full">
                      <tbody className="divide-y divide-emerald-100">
                        {selectedStub.breakdown.bonuses.map((bonus, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {getCategoryLabel(bonus.category)}
                              {bonus.description && (
                                <span className="text-gray-500 ml-2">- {bonus.description}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-emerald-600 text-right">
                              +{formatCurrency(bonus.amount, selectedStub.currency)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-emerald-100/50">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">Total Bonuses</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">
                            +{formatCurrency(selectedStub.total_bonuses, selectedStub.currency)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedStub.breakdown.deductions && selectedStub.breakdown.deductions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <MinusCircle className="w-5 h-5 text-red-500" />
                    Deductions
                  </h3>
                  <div className="border border-red-200 rounded-xl overflow-hidden bg-red-50/50">
                    <table className="min-w-full">
                      <tbody className="divide-y divide-red-100">
                        {selectedStub.breakdown.deductions.map((deduction, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {getCategoryLabel(deduction.category)}
                              {deduction.description && (
                                <span className="text-gray-500 ml-2">- {deduction.description}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-red-600 text-right">
                              -{formatCurrency(deduction.amount, selectedStub.currency)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-red-100/50">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">Total Deductions</td>
                          <td className="px-4 py-3 text-sm font-bold text-red-600 text-right">
                            -{formatCurrency(selectedStub.total_deductions, selectedStub.currency)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="p-4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl text-white">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-emerald-100 text-sm">Net Pay</p>
                    <p className="text-3xl font-bold">{formatCurrency(selectedStub.net_pay, selectedStub.currency)}</p>
                  </div>
                  <div className="text-right">
                    <Clock className="w-8 h-8 text-emerald-200" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
