import { useEffect, useState } from 'react';
import { Users, FileText, Plus, DollarSign, TrendingUp, Bird, Egg, Calendar, Download, Share2, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Customer, SalesInvoice, Flock } from '../../types/database';
import { CustomerList } from './CustomerList';
import { InvoiceList } from './InvoiceList';
import { AddCustomerModal } from './AddCustomerModal';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { RecordBirdSaleModal } from './RecordBirdSaleModal';
import { BirdSalesList } from './BirdSalesList';
import { EggSalesList } from './EggSalesList';
import { RecordEggSale } from '../eggs/RecordEggSale';
import { ReceiptsList } from './ReceiptsList';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { usePermissions } from '../../contexts/PermissionsContext';
import { formatEggsCompact } from '../../utils/eggFormatting';
import { shareViaWhatsApp } from '../../utils/whatsappShare';

type TimePeriod = 'all' | 'year' | 'month' | 'week' | 'day' | 'custom';

function getDateRange(period: TimePeriod): { start: string | null; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  if (period === 'all') return { start: null, end };

  const start = new Date(now);

  switch (period) {
    case 'day':
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return { start: start.toISOString().split('T')[0], end };
}

export function SalesManagement() {
  const { t } = useTranslation();
  const { profile, currentFarm, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const [activeTab, setActiveTab] = useState<'record' | 'history' | 'customers' | 'invoices'>('record');
  const [historySubTab, setHistorySubTab] = useState<'birds' | 'eggs' | 'receipts'>('eggs');
  const [saleType, setSaleType] = useState<'bird' | 'egg'>('bird');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [birdSalesRefreshTrigger, setBirdSalesRefreshTrigger] = useState(0);
  const [eggSalesRefreshTrigger, setEggSalesRefreshTrigger] = useState(0);
  const [receiptsRefreshTrigger, setReceiptsRefreshTrigger] = useState(0);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalRevenue: 0,
    pendingInvoices: 0,
    paidInvoices: 0,
    broilerBirdsSold: 0,
    layerBirdsSold: 0,
    totalEggsSold: 0,
    eggSaleRevenue: 0,
    birdSaleRevenue: 0,
  });
  const hideFinancials = shouldHideFinancialData(currentRole, farmPermissions);

  useEffect(() => {
    if (currentFarm?.id) {
      loadFarmSettings();
    }
  }, [currentFarm?.id]);

  useEffect(() => {
    if (currentFarm?.id) {
      loadData();
    }
  }, [currentFarm?.id, activeTab, timePeriod, customStartDate, customEndDate]);

  async function loadFarmSettings() {
    if (!currentFarm?.id) return;
    const { data } = await supabase
      .from('farms')
      .select('eggs_per_tray')
      .eq('id', currentFarm.id)
      .maybeSingle();

    if (data?.eggs_per_tray) {
      setEggsPerTray(data.eggs_per_tray);
    }
  }

  const loadData = async (silent = false) => {
    if (!currentFarm?.id) return;

    if (!silent) setLoading(true);
    try {
      let dateRange: { start: string | null; end: string };

      if (timePeriod === 'custom') {
        const now = new Date();
        dateRange = {
          start: customStartDate || null,
          end: customEndDate || now.toISOString().split('T')[0]
        };
      } else {
        dateRange = getDateRange(timePeriod);
      }

      let birdSalesQuery = supabase
        .from('bird_sales')
        .select('birds_sold, total_amount, flock_id, flocks(type)')
        .eq('farm_id', currentFarm.id);

      if (dateRange.start) {
        birdSalesQuery = birdSalesQuery.gte('sale_date', dateRange.start).lte('sale_date', dateRange.end);
      }

      let eggSalesQuery = supabase
        .from('egg_sales')
        .select('total_eggs, total_amount, customer_name')
        .eq('farm_id', currentFarm.id);

      if (dateRange.start) {
        eggSalesQuery = eggSalesQuery.gte('sale_date', dateRange.start).lte('sale_date', dateRange.end);
      }

      const [customersRes, invoicesRes, birdSalesRes, flocksRes, eggSalesRes] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('sales_invoices')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .order('created_at', { ascending: false }),
        birdSalesQuery,
        supabase
          .from('flocks')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .eq('status', 'active')
          .order('name'),
        eggSalesQuery,
      ]);

      const customerData = customersRes.data || [];
      const invoiceData = invoicesRes.data || [];
      const birdSalesData = birdSalesRes.data || [];
      const flocksData = flocksRes.data || [];
      const eggSalesData = eggSalesRes.data || [];

      setCustomers(customerData);
      setInvoices(invoiceData);
      setFlocks(flocksData);

      const broilerBirdsSold = birdSalesData
        .filter((sale: any) => {
          const flockType = sale.flocks?.type?.toLowerCase();
          return flockType === 'broiler';
        })
        .reduce((sum: number, sale: any) => sum + (sale.birds_sold || 0), 0);

      const layerBirdsSold = birdSalesData
        .filter((sale: any) => {
          const flockType = sale.flocks?.type?.toLowerCase();
          return flockType === 'layer';
        })
        .reduce((sum: number, sale: any) => sum + (sale.birds_sold || 0), 0);

      const birdSaleRevenue = birdSalesData.reduce((sum: number, sale: any) => sum + (sale.total_amount || 0), 0);
      const eggSaleRevenue = eggSalesData.reduce((sum: number, sale: any) => sum + (sale.total_amount || 0), 0);
      const totalEggsSold = eggSalesData.reduce((sum: number, sale: any) => sum + (sale.total_eggs || 0), 0);
      const totalRevenue = eggSaleRevenue + birdSaleRevenue;

      // Count unique customers across all sources
      const uniqueCustomerNames = new Set<string>([
        ...customerData.map((c: any) => (c.name || '').toLowerCase().trim()).filter(Boolean),
        ...(eggSalesRes.data || []).map((s: any) => (s.customer_name || '').toLowerCase().trim()).filter(Boolean),
        ...(birdSalesRes.data || []).map((s: any) => (s.customer_name || '').toLowerCase().trim()).filter(Boolean),
      ]);

      setStats({
        totalCustomers: uniqueCustomerNames.size,
        totalRevenue,
        pendingInvoices: invoiceData.filter((inv) => inv.status !== 'paid' && inv.status !== 'cancelled').length,
        paidInvoices: invoiceData.filter((inv) => inv.status === 'paid').length,
        broilerBirdsSold,
        layerBirdsSold,
        totalEggsSold,
        eggSaleRevenue,
        birdSaleRevenue,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const downloadReport = () => {
    const dateRangeText = timePeriod === 'custom'
      ? `${customStartDate} to ${customEndDate}`
      : timePeriod === 'all'
      ? 'All Time'
      : `Last ${timePeriod}`;

    const csvContent = [
      ['Sales Report', currentFarm?.name || ''],
      ['Date Range', dateRangeText],
      ['Generated', new Date().toLocaleDateString()],
      [''],
      ['Metric', 'Value'],
      ['Broiler Birds Sold', stats.broilerBirdsSold.toString()],
      ['Layer Birds Sold', stats.layerBirdsSold.toString()],
      ['Total Eggs Sold', stats.totalEggsSold.toString()],
      ['Total Customers', stats.totalCustomers.toString()],
      ...(!hideFinancials ? [
        ['Bird Sale Revenue', `${profile?.currency_preference || ''} ${stats.birdSaleRevenue.toLocaleString()}`],
        ['Egg Sale Revenue', `${profile?.currency_preference || ''} ${stats.eggSaleRevenue.toLocaleString()}`],
        ['Total Revenue', `${profile?.currency_preference || ''} ${stats.totalRevenue.toLocaleString()}`],
        ['Pending Invoices', stats.pendingInvoices.toString()],
        ['Paid Invoices', stats.paidInvoices.toString()],
      ] : []),
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const shareReport = () => {
    const dateRangeText = timePeriod === 'custom'
      ? `${customStartDate} to ${customEndDate}`
      : timePeriod === 'all'
      ? 'All Time'
      : `Last ${timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1)}`;

    let message = `*Sales Report - ${currentFarm?.name || 'Farm'}*\n`;
    message += `📅 Period: ${dateRangeText}\n\n`;
    message += `*Sales Summary:*\n`;
    message += `🐔 Broiler Birds Sold: ${stats.broilerBirdsSold.toLocaleString()}\n`;
    message += `🐔 Layer Birds Sold: ${stats.layerBirdsSold.toLocaleString()}\n`;
    message += `🥚 Eggs Sold: ${stats.totalEggsSold.toLocaleString()}\n`;
    message += `👥 Total Customers: ${stats.totalCustomers}\n`;

    if (!hideFinancials) {
      message += `\n*Revenue:*\n`;
      message += `💰 Bird Sales: ${profile?.currency_preference || ''} ${stats.birdSaleRevenue.toLocaleString()}\n`;
      message += `💰 Egg Sales: ${profile?.currency_preference || ''} ${stats.eggSaleRevenue.toLocaleString()}\n`;
      message += `💰 Total Revenue: ${profile?.currency_preference || ''} ${stats.totalRevenue.toLocaleString()}\n`;
      message += `\n📄 Pending Invoices: ${stats.pendingInvoices}\n`;
      message += `✅ Paid Invoices: ${stats.paidInvoices}`;
    }

    shareViaWhatsApp(message);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Simple Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('sales.title')}</h1>
          <p className="text-gray-500 mt-1">{t('sales.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadReport}
            className="btn-secondary inline-flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('sales.download')}
          </button>
          <button
            onClick={shareReport}
            className="btn-secondary inline-flex items-center"
          >
            <Share2 className="w-4 h-4 mr-2" />
            {t('sales.share')}
          </button>
          {activeTab === 'customers' && (
            <button
              onClick={() => setShowAddCustomer(true)}
              className="btn-primary inline-flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              {t('sales.new_customer')}
            </button>
          )}
          {activeTab === 'invoices' && (
            <button
              onClick={() => setShowCreateInvoice(true)}
              className="btn-primary inline-flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              {t('sales.new_invoice')}
            </button>
          )}
        </div>
      </div>

      {/* Compact Time Period Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">{t('sales.time_period')}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'year', 'month', 'week', 'day', 'custom'] as TimePeriod[]).map((period) => (
            <button
              key={period}
              onClick={() => setTimePeriod(period)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timePeriod === period
                  ? 'bg-[#F4D03F] text-gray-900'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`sales.${period === 'all' ? 'all_time' : period === 'day' ? 'today' : period}`)}
            </button>
          ))}
        </div>
        {timePeriod === 'custom' && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F4D03F]"
              placeholder={t('sales.start_date')}
            />
            <span className="text-gray-500">-</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F4D03F]"
              placeholder={t('sales.end_date')}
            />
          </div>
        )}
      </div>

      {/* Simplified Key Metrics - Only 4 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!hideFinancials && (
          <div className="section-card-yellow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t('sales.total_revenue')}</div>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {currentFarm?.currency_code || currentFarm?.currency || 'XAF'} {stats.totalRevenue.toLocaleString()}
            </div>
          </div>
        )}
        <div className="section-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t('sales.total_customers')}</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalCustomers}</div>
        </div>
        <div className="section-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t('sales.pending_invoices')}</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.pendingInvoices}</div>
        </div>
        <div className="section-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t('sales.paid_invoices')}</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.paidInvoices}</div>
        </div>
      </div>

      {/* Clean Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-1 whitespace-nowrap min-w-max">
          <button
            onClick={() => setActiveTab('record')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'record'
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            {t('sales.record_sales')}
            {activeTab === 'record' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'history'
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            {t('sales.sales_history')}
            {activeTab === 'history' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'customers'
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('sales.customers')}
            {activeTab === 'customers' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F4D03F] rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'invoices'
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            {t('sales.invoices')}
            {activeTab === 'invoices' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F4D03F] rounded-full" />
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="pt-6">
          {activeTab === 'record' ? (
            <div className="max-w-3xl mx-auto">
              <div className="mb-6">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto whitespace-nowrap">
                  <button
                    onClick={() => setSaleType('bird')}
                    className={`px-4 sm:px-6 py-2 rounded-lg font-medium transition-colors ${
                      saleType === 'bird'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Bird className="w-4 h-4 inline-block mr-2" />
                    {t('sales.sell_birds')}
                  </button>
                  <button
                    onClick={() => setSaleType('egg')}
                    className={`px-4 sm:px-6 py-2 rounded-lg font-medium transition-colors ${
                      saleType === 'egg'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Egg className="w-4 h-4 inline-block mr-2" />
                    {t('sales.sell_eggs')}
                  </button>
                </div>
              </div>

              {saleType === 'bird' ? (
                <RecordBirdSaleModal
                  onClose={() => {}}
                  onSuccess={() => {
                    setBirdSalesRefreshTrigger(prev => prev + 1);
                    loadData(true);
                  }}
                  isEmbedded={true}
                />
              ) : (
                <div>
                  <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl text-sm text-amber-900">
                    <p className="font-medium mb-1">{t('sales.record_egg_collections_dashboard')}</p>
                    <p className="text-amber-700">{t('sales.workers_record_daily')}</p>
                  </div>
                  <RecordEggSale
                    farmId={currentFarm?.id || ''}
                    onSuccess={() => {
                      setEggSalesRefreshTrigger(prev => prev + 1);
                      loadData(true);
                    }}
                  />
                </div>
              )}
            </div>
          ) : activeTab === 'history' ? (
            <div>
              <div className="mb-4 border-b border-gray-200 overflow-x-auto">
                <div className="flex gap-2 sm:gap-4 whitespace-nowrap min-w-max">
                  <button
                    onClick={() => setHistorySubTab('birds')}
                    className={`px-4 py-2 font-medium transition-colors ${
                      historySubTab === 'birds'
                        ? 'text-green-600 border-b-2 border-green-500'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Bird className="w-4 h-4 inline-block mr-2" />
                    {t('sales.bird_sales')}
                  </button>
                  <button
                    onClick={() => setHistorySubTab('eggs')}
                    className={`px-4 py-2 font-medium transition-colors ${
                      historySubTab === 'eggs'
                        ? 'text-amber-600 border-b-2 border-amber-500'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Egg className="w-4 h-4 inline-block mr-2" />
                    {t('sales.egg_sales')}
                  </button>
                  <button
                    onClick={() => setHistorySubTab('receipts')}
                    className={`px-4 py-2 font-medium transition-colors ${
                      historySubTab === 'receipts'
                        ? 'text-blue-600 border-b-2 border-blue-500'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Receipt className="w-4 h-4 inline-block mr-2" />
                    {t('sales.receipts')}
                  </button>
                </div>
              </div>

              {historySubTab === 'birds' && <BirdSalesList refreshTrigger={birdSalesRefreshTrigger} />}
              {historySubTab === 'eggs' && <EggSalesList refreshTrigger={eggSalesRefreshTrigger} />}
              {historySubTab === 'receipts' && <ReceiptsList refreshTrigger={receiptsRefreshTrigger} />}
            </div>
          ) : activeTab === 'customers' ? (
            <CustomerList customers={customers} onRefresh={loadData} />
          ) : (
            <InvoiceList invoices={invoices} customers={customers} onRefresh={loadData} />
          )}
      </div>

      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onCreated={() => {
            setShowAddCustomer(false);
            loadData(true);
          }}
        />
      )}

      {showCreateInvoice && (
        <CreateInvoiceModal
          customers={customers}
          onClose={() => setShowCreateInvoice(false)}
          onCreated={() => {
            setShowCreateInvoice(false);
            loadData(true);
          }}
        />
      )}
    </div>
  );
}
