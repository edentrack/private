import { useState, useEffect } from 'react';
import { FileText, Download, Share2, Calendar, TrendingUp, TrendingDown, DollarSign, Package, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { shareViaWhatsApp } from '../../utils/whatsappShare';
import { formatCurrency } from '../../utils/currency';
import { formatEggsCompact } from '../../utils/eggFormatting';
import { downloadPDFReport } from '../../utils/pdfGenerator';

interface FarmStats {
  totalFlocks: number;
  activeFlocks: number;
  totalBirds: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  eggsCollected: number;
  eggsSold: number;
  eggsInStock: number;
  birdsSold: number;
  birdSalesRevenue: number;
  mortalityCount: number;
  feedStock: number;
}

interface FlockBreakdown {
  id: string;
  name: string;
  type: string;
  current_count: number;
  revenue: number;
  expenses: number;
  profit: number;
  eggsCollected: number;
  eggsSold: number;
  birdsSold: number;
  birdSalesRevenue: number;
  mortality: number;
}

interface ComprehensiveFarmReportProps {
  startDate?: string;
  endDate?: string;
}

export function ComprehensiveFarmReport({
  startDate: propStartDate,
  endDate: propEndDate
}: ComprehensiveFarmReportProps) {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [startDate, setStartDate] = useState(propStartDate || '');
  const [endDate, setEndDate] = useState(propEndDate || new Date().toISOString().split('T')[0]);
  const [stats, setStats] = useState<FarmStats | null>(null);
  const [flockBreakdowns, setFlockBreakdowns] = useState<FlockBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [eggsPerTray, setEggsPerTray] = useState(30);

  const currencyCode = currentFarm?.currency_code || 'XAF';

  // Load the earliest recorded date to set as default start date
  useEffect(() => {
    loadEarliestDate();
  }, [currentFarm?.id]);

  const loadEarliestDate = async () => {
    if (!currentFarm?.id) return;
    
    try {
      // Start with the farm's creation date as the baseline
      const dates: string[] = [];
      if (currentFarm.created_at) {
        dates.push(currentFarm.created_at.split('T')[0]);
      }
      
      // Find the earliest date from expenses, revenues, egg_collections, or mortality_logs
      const [expensesRes, revenuesRes, eggCollectionsRes, mortalityRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('incurred_on')
          .eq('farm_id', currentFarm.id)
          .order('incurred_on', { ascending: true })
          .limit(1),
        supabase
          .from('revenues')
          .select('revenue_date')
          .eq('farm_id', currentFarm.id)
          .order('revenue_date', { ascending: true })
          .limit(1),
        supabase
          .from('egg_collections')
          .select('collected_on')
          .eq('farm_id', currentFarm.id)
          .order('collected_on', { ascending: true })
          .limit(1),
        supabase
          .from('mortality_logs')
          .select('event_date')
          .eq('farm_id', currentFarm.id)
          .order('event_date', { ascending: true })
          .limit(1),
      ]);
      
      if (expensesRes.data && expensesRes.data.length > 0 && expensesRes.data[0].incurred_on) {
        dates.push(expensesRes.data[0].incurred_on);
      }
      if (revenuesRes.data && revenuesRes.data.length > 0 && revenuesRes.data[0].revenue_date) {
        dates.push(revenuesRes.data[0].revenue_date);
      }
      if (eggCollectionsRes.data && eggCollectionsRes.data.length > 0 && eggCollectionsRes.data[0].collected_on) {
        dates.push(eggCollectionsRes.data[0].collected_on);
      }
      if (mortalityRes.data && mortalityRes.data.length > 0 && mortalityRes.data[0].event_date) {
        dates.push(mortalityRes.data[0].event_date);
      }

      // Also check flock creation dates
      const { data: flocks } = await supabase
        .from('flocks')
        .select('arrival_date, created_at')
        .eq('farm_id', currentFarm.id);

      if (flocks && flocks.length > 0) {
        flocks.forEach(flock => {
          if (flock.arrival_date) dates.push(flock.arrival_date);
          if (flock.created_at) dates.push(flock.created_at.split('T')[0]);
        });
      }

      if (dates.length > 0) {
        // Find the earliest date
        const earliestDate = dates.sort()[0];
        // Only update if startDate hasn't been manually set and it's not a prop
        if (!propStartDate && !startDate) {
          setStartDate(earliestDate);
        }
      } else {
        // If no data found, use today as default (user probably just started)
        if (!propStartDate && !startDate) {
          const today = new Date();
          today.setMonth(today.getMonth() - 1); // Default to last month if no data
          setStartDate(today.toISOString().split('T')[0]);
        }
      }
    } catch (error) {
      console.error('Error loading earliest date:', error);
      // Fallback to last month if we can't determine the earliest date
      if (!propStartDate && !startDate) {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        setStartDate(date.toISOString().split('T')[0]);
      }
    }
  };

  useEffect(() => {
    loadFarmReport();
  }, [currentFarm?.id, startDate, endDate]);

  async function loadFarmReport() {
    if (!currentFarm?.id || !startDate) return; // Wait for startDate to be set

    setLoading(true);
    try {
      const { data: farmData } = await supabase
        .from('farms')
        .select('eggs_per_tray')
        .eq('id', currentFarm.id)
        .maybeSingle();
      if (farmData?.eggs_per_tray) {
        setEggsPerTray(farmData.eggs_per_tray);
      }
      const { data: flocks } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm.id);

      if (!flocks) {
        setLoading(false);
        return;
      }

      const activeFlocks = flocks.filter(f => f.status === 'active');
      const totalBirds = activeFlocks.reduce((sum, f) => sum + (f.current_count || 0), 0);

      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('farm_id', currentFarm.id)
        .gte('incurred_on', startDate)
        .lte('incurred_on', endDate);

      // Convert all amounts to numbers and sum them
      const totalExpenses = expenses?.reduce((sum, e) => sum + (Number(e.amount || 0)), 0) || 0;

      const { data: eggCollections } = await supabase
        .from('egg_collections')
        .select('total_eggs')
        .eq('farm_id', currentFarm.id)
        .gte('collected_on', startDate)
        .lte('collected_on', endDate);

      const eggsCollected = eggCollections?.reduce((sum, e) => sum + (e.total_eggs || 0), 0) || 0;

      const { data: eggSales } = await supabase
        .from('egg_sales')
        .select('total_eggs, total_amount')
        .eq('farm_id', currentFarm.id)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate);

      const eggsSold = eggSales?.reduce((sum, s) => sum + (s.total_eggs || 0), 0) || 0;
      const eggSalesRevenue = eggSales?.reduce((sum, s) => sum + (Number(s.total_amount || 0)), 0) || 0;

      // Legacy compatibility: older egg sales may have null flock_id.
      // We keep them in farm totals, and if there is only one active layer flock
      // we attribute them to that flock in the breakdown.
      const { data: legacyUnlinkedEggSales } = await supabase
        .from('egg_sales')
        .select('total_eggs, total_amount')
        .eq('farm_id', currentFarm.id)
        .is('flock_id', null)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate);
      const legacyEggsSold = legacyUnlinkedEggSales?.reduce((sum, s) => sum + (Number(s.total_eggs || 0)), 0) || 0;
      const legacyEggSalesRevenue = legacyUnlinkedEggSales?.reduce((sum, s) => sum + (Number(s.total_amount || 0)), 0) || 0;

      const { data: mortality } = await supabase
        .from('mortality_logs')
        .select('count')
        .eq('farm_id', currentFarm.id)
        .gte('event_date', startDate)
        .lte('event_date', endDate);

      const mortalityCount = mortality?.reduce((sum, m) => sum + (m.count || 0), 0) || 0;

      const { data: feedStockData } = await supabase
        .from('feed_stock')
        .select('bags_in_stock')
        .eq('farm_id', currentFarm.id);

      const feedStock = feedStockData?.reduce((sum, f) => sum + (Number(f.bags_in_stock || 0)), 0) || 0;

      const { data: birdSales } = await supabase
        .from('bird_sales')
        .select('birds_sold, total_amount')
        .eq('farm_id', currentFarm.id)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate);

      const birdsSold = birdSales?.reduce((sum, s) => sum + (s.birds_sold || 0), 0) || 0;
      const birdSalesRevenue = birdSales?.reduce((sum, s) => sum + (Number(s.total_amount || 0)), 0) || 0;

      // Total revenue is sourced from sales tables only.
      const calculatedTotalRevenue = (birdSalesRevenue || 0) + (eggSalesRevenue || 0);

      const farmStats: FarmStats = {
        totalFlocks: flocks.length,
        activeFlocks: activeFlocks.length,
        totalBirds,
        totalRevenue: calculatedTotalRevenue,
        totalExpenses,
        netProfit: calculatedTotalRevenue - totalExpenses,
        eggsCollected,
        eggsSold,
        eggsInStock: eggsCollected - eggsSold,
        birdsSold,
        birdSalesRevenue,
        mortalityCount,
        feedStock,
      };

      // Calculate breakdowns first, then verify total expenses matches sum of flock expenses
      const breakdowns: FlockBreakdown[] = await Promise.all(
        flocks.map(async (flock) => {
          const layerFlocks = flocks.filter(
            (f: any) => String((f as any).type || (f as any).purpose || '').toLowerCase() === 'layer'
          );
          const singleLayerFlockId = layerFlocks.length === 1 ? layerFlocks[0].id : null;
          const attachLegacyEggSales = flock.id === singleLayerFlockId;

          const { data: flockExpenses } = await supabase
            .from('expenses')
            .select('amount')
            .eq('flock_id', flock.id)
            .gte('incurred_on', startDate)
            .lte('incurred_on', endDate);

          // Convert all amounts to numbers and sum them
          const flockExpenseTotal = flockExpenses?.reduce((sum, e) => sum + (Number(e.amount || 0)), 0) || 0;

          const { data: flockEggCollections } = await supabase
            .from('egg_collections')
            .select('total_eggs')
            .eq('flock_id', flock.id)
            .gte('collected_on', startDate)
            .lte('collected_on', endDate);

          const flockEggsCollected = flockEggCollections?.reduce((sum, e) => sum + (e.total_eggs || 0), 0) || 0;

          const { data: flockEggSales } = await supabase
            .from('egg_sales')
            .select('total_eggs, total_amount')
            .eq('flock_id', flock.id)
            .gte('sale_date', startDate)
            .lte('sale_date', endDate);

          const flockEggsSoldBase = flockEggSales?.reduce((sum, s) => sum + (s.total_eggs || 0), 0) || 0;
          const flockEggSalesRevenueBase = flockEggSales?.reduce((sum, s) => sum + (Number(s.total_amount || 0)), 0) || 0;
          const flockEggsSold = flockEggsSoldBase + (attachLegacyEggSales ? legacyEggsSold : 0);
          const flockEggSalesRevenue = flockEggSalesRevenueBase + (attachLegacyEggSales ? legacyEggSalesRevenue : 0);

          const { data: flockMortality } = await supabase
            .from('mortality_logs')
            .select('count')
            .eq('flock_id', flock.id)
            .gte('event_date', startDate)
            .lte('event_date', endDate);

          const flockMortalityCount = flockMortality?.reduce((sum, m) => sum + (m.count || 0), 0) || 0;

          const { data: flockBirdSales } = await supabase
            .from('bird_sales')
            .select('birds_sold, total_amount')
            .eq('flock_id', flock.id)
            .gte('sale_date', startDate)
            .lte('sale_date', endDate);

          const flockBirdsSold = flockBirdSales?.reduce((sum, s) => sum + (s.birds_sold || 0), 0) || 0;
          const flockBirdSalesRevenue = flockBirdSales?.reduce((sum, s) => sum + (Number(s.total_amount || 0)), 0) || 0;

          // Flock revenue is sourced from sales tables only.
          const flockTotalRevenue = (flockBirdSalesRevenue || 0) + (flockEggSalesRevenue || 0);

          return {
            id: flock.id,
            name: flock.name,
            type: flock.type || 'Unknown',
            current_count: flock.current_count || 0,
            revenue: flockTotalRevenue,
            expenses: flockExpenseTotal,
            profit: flockTotalRevenue - flockExpenseTotal,
            eggsCollected: flockEggsCollected,
            eggsSold: flockEggsSold,
            birdsSold: flockBirdsSold,
            birdSalesRevenue: flockBirdSalesRevenue,
            mortality: flockMortalityCount,
          };
        })
      );

      // Verify that total expenses matches the sum of all flock expenses
      // This ensures consistency between total and breakdown
      const sumOfFlockExpenses = breakdowns.reduce((sum, flock) => sum + (Number(flock.expenses) || 0), 0);
      
      // Use the sum of flock expenses as the authoritative total
      // This ensures consistency between total and breakdown
      const verifiedTotalExpenses = sumOfFlockExpenses;
      
      // Update stats with verified total expenses
      setStats({
        ...farmStats,
        totalExpenses: verifiedTotalExpenses,
        netProfit: calculatedTotalRevenue - verifiedTotalExpenses,
      });

      setFlockBreakdowns(breakdowns);
    } catch (error) {
      console.error('Error loading farm report:', error);
    } finally {
      setLoading(false);
    }
  }

  async function exportToPDF() {
    if (!stats || !currentFarm) return;

    // Ensure we have latest data (in case user changed date range)
    await loadFarmReport();

    const reportData = {
      farmName: currentFarm.name || 'Farm',
      reportType: 'custom' as const,
      startDate,
      endDate,
      flocks: flockBreakdowns.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        current_count: f.current_count,
        initial_count: f.current_count,
        arrival_date: startDate, // Approximate
        status: 'active',
      })),
      stats: {
        totalRevenue: stats.totalRevenue,
        totalExpenses: stats.totalExpenses,
        netProfit: stats.netProfit,
        totalBirds: stats.totalBirds,
        activeFlocks: stats.activeFlocks,
        eggsCollected: stats.eggsCollected,
        eggsSold: stats.eggsSold,
        mortalityCount: stats.mortalityCount,
      },
    };

    const filename = `${currentFarm.name || 'Farm'}_Report_${startDate}_to_${endDate}.pdf`;
    downloadPDFReport(reportData, filename, currencyCode);
  }

  function exportToCSV() {
    if (!stats || !currentFarm) return;

    const farmName = currentFarm.name || 'Farm';
    const fileName = `${farmName}_Comprehensive_Report_${startDate}_to_${endDate}.csv`;

    const headers = [
      ['FARM OVERVIEW'],
      ['Period', `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`],
      [],
      ['Metric', 'Value'],
      ['Total Flocks', stats.totalFlocks],
      [t('insights.active_flocks'), stats.activeFlocks],
      ['Total Birds', stats.totalBirds],
      [t('insights.total_revenue'), stats.totalRevenue],
      [t('insights.total_expenses'), stats.totalExpenses],
      [t('insights.net_profit'), stats.netProfit],
      ['Eggs Collected', `${formatEggsCompact(stats.eggsCollected, eggsPerTray)} (${stats.eggsCollected} total)`],
      ['Eggs Sold', `${formatEggsCompact(stats.eggsSold, eggsPerTray)} (${stats.eggsSold} total)`],
      ['Eggs in Stock', `${formatEggsCompact(stats.eggsInStock, eggsPerTray)} (${stats.eggsInStock} total)`],
      ['Birds Sold', stats.birdsSold],
      ['Bird Sales Revenue', stats.birdSalesRevenue],
      ['Mortality Count', stats.mortalityCount],
      [`${t('insights.feed_stock')} (${t('dashboard.bags')})`, stats.feedStock],
      [],
      [],
      ['FLOCK BREAKDOWN'],
      ['Flock Name', 'Type', 'Bird Count', 'Revenue', 'Expenses', 'Profit', 'Eggs Collected', 'Eggs Sold', 'Birds Sold', 'Bird Sales Revenue', 'Mortality'],
    ];

    const flockRows = flockBreakdowns.map(f => [
      f.name,
      f.type,
      f.current_count,
      f.revenue,
      f.expenses,
      f.profit,
      `${formatEggsCompact(f.eggsCollected, eggsPerTray)} (${f.eggsCollected})`,
      `${formatEggsCompact(f.eggsSold, eggsPerTray)} (${f.eggsSold})`,
      f.birdsSold,
      f.birdSalesRevenue,
      f.mortality,
    ]);

    const csvContent = [...headers, ...flockRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  }

  function shareReport() {
    if (!stats || !currentFarm) return;

    const farmName = currentFarm.name || 'Farm';
    const profitMargin = stats.totalRevenue > 0
      ? ((stats.netProfit / stats.totalRevenue) * 100).toFixed(1)
      : '0';

    let message = `*${farmName} - Comprehensive Farm Report*\n\n` +
      `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}\n\n` +
      `*Farm Overview:*\n` +
      `Total Flocks: ${stats.totalFlocks} (${stats.activeFlocks} active)\n` +
      `Total Birds: ${stats.totalBirds.toLocaleString()}\n\n` +
      `*Financial Summary:*\n` +
      `Revenue: ${formatCurrency(stats.totalRevenue, currencyCode)}\n` +
      `Expenses: ${formatCurrency(stats.totalExpenses, currencyCode)}\n` +
      `Net Profit: ${formatCurrency(stats.netProfit, currencyCode)}\n` +
      `Profit Margin: ${profitMargin}%\n\n`;

    if (stats.eggsCollected > 0) {
      message += `*Egg Production:*\n` +
        `Eggs Collected: ${formatEggsCompact(stats.eggsCollected, eggsPerTray)} (${stats.eggsCollected.toLocaleString()} total)\n` +
        `Eggs Sold: ${formatEggsCompact(stats.eggsSold, eggsPerTray)} (${stats.eggsSold.toLocaleString()} total)\n` +
        `In Stock: ${formatEggsCompact(stats.eggsInStock, eggsPerTray)} (${stats.eggsInStock.toLocaleString()} total)\n\n`;
    }

    if (stats.birdsSold > 0) {
      message += `*Bird Sales:*\n` +
        `Birds Sold: ${stats.birdsSold.toLocaleString()}\n` +
        `Revenue: ${formatCurrency(stats.birdSalesRevenue, currencyCode)}\n` +
        `Avg per bird: ${formatCurrency(stats.birdSalesRevenue / stats.birdsSold, currencyCode)}\n\n`;
    }

    message += `*Health:*\n` +
      `Mortality: ${stats.mortalityCount} birds\n` +
      `Feed Stock: ${stats.feedStock.toLocaleString()} bags`;

    shareViaWhatsApp(message);
  }

  if (loading && !stats) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{t('insights.comprehensive_farm_report')}</h3>
            <p className="text-sm text-gray-600">{t('insights.all_flocks_combined')}</p>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          {showFilters ? 'Hide' : 'Show'} Filters
        </button>
      </div>

      {showFilters && (
        <div className="bg-gray-50 rounded-2xl p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-green-900">{t('insights.total_revenue')}</p>
              </div>
              <p className="text-2xl font-bold text-green-900">
                {formatCurrency(stats.totalRevenue, currencyCode)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-red-600" />
                <p className="text-sm font-medium text-red-900">{t('insights.total_expenses')}</p>
              </div>
              <p className="text-2xl font-bold text-red-900">
                {formatCurrency(stats.totalExpenses, currencyCode)}
              </p>
            </div>

            <div className={`bg-gradient-to-br ${stats.netProfit >= 0 ? 'from-blue-50 to-cyan-50' : 'from-orange-50 to-red-50'} rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className={`w-5 h-5 ${stats.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                <p className={`text-sm font-medium ${stats.netProfit >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>{t('insights.net_profit')}</p>
              </div>
              <p className={`text-2xl font-bold ${stats.netProfit >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                {formatCurrency(stats.netProfit, currencyCode)}
              </p>
              <p className={`text-sm mt-1 ${stats.netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {stats.totalRevenue > 0 ? `${((stats.netProfit / stats.totalRevenue) * 100).toFixed(1)}% margin` : '0% margin'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-5 h-5 text-amber-600" />
                <p className="text-sm font-medium text-amber-900">{t('insights.active_flocks')}</p>
              </div>
              <p className="text-2xl font-bold text-amber-900">
                {stats.activeFlocks}
              </p>
              <p className="text-sm text-amber-700 mt-1">
                {stats.totalBirds.toLocaleString()} birds
              </p>
            </div>
          </div>

          {stats.eggsCollected > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Egg Production</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl p-4">
                  <p className="text-sm font-medium text-amber-900 mb-2">Eggs Collected</p>
                  <p className="text-2xl font-bold text-amber-900">{formatEggsCompact(stats.eggsCollected, eggsPerTray)}</p>
                  <p className="text-xs text-amber-700 mt-1">{stats.eggsCollected.toLocaleString()} total eggs</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-2xl p-4">
                  <p className="text-sm font-medium text-green-900 mb-2">Eggs Sold</p>
                  <p className="text-2xl font-bold text-green-900">{formatEggsCompact(stats.eggsSold, eggsPerTray)}</p>
                  <p className="text-xs text-green-700 mt-1">{stats.eggsSold.toLocaleString()} total eggs</p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4">
                  <p className="text-sm font-medium text-blue-900 mb-2">Eggs in Stock</p>
                  <p className="text-2xl font-bold text-blue-900">{formatEggsCompact(stats.eggsInStock, eggsPerTray)}</p>
                  <p className="text-xs text-blue-700 mt-1">{stats.eggsInStock.toLocaleString()} total eggs</p>
                </div>
              </div>
            </div>
          )}

          {stats.birdsSold > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Bird Sales</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4">
                  <p className="text-sm font-medium text-purple-900 mb-2">Birds Sold</p>
                  <p className="text-2xl font-bold text-purple-900">{stats.birdsSold.toLocaleString()}</p>
                  <p className="text-xs text-purple-700 mt-1">broilers</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4">
                  <p className="text-sm font-medium text-green-900 mb-2">{t('insights.bird_sales_revenue')}</p>
                  <p className="text-2xl font-bold text-green-900">{formatCurrency(stats.birdSalesRevenue, currencyCode)}</p>
                  <p className="text-xs text-green-700 mt-1">
                    {stats.birdsSold > 0 ? `${formatCurrency(stats.birdSalesRevenue / stats.birdsSold, currencyCode)} per bird` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm font-medium text-red-900">{t('insights.total_mortality')}</p>
              </div>
              <p className="text-2xl font-bold text-red-900">{stats.mortalityCount.toLocaleString()}</p>
              <p className="text-sm text-red-700 mt-1">
                {stats.totalBirds > 0 ? `${((stats.mortalityCount / stats.totalBirds) * 100).toFixed(2)}% rate` : '0% rate'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-lime-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-green-900">{t('insights.feed_stock')}</p>
              </div>
              <p className="text-2xl font-bold text-green-900">{stats.feedStock.toLocaleString()} bags</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={exportToPDF}
              className="flex items-center gap-2 px-4 py-2 bg-agri-brown-600 text-white rounded-xl hover:bg-agri-brown-700 transition-colors font-medium"
            >
              <FileText className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              {t('insights.download_csv')}
            </button>
            <button
              onClick={shareReport}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
            >
              <Share2 className="w-4 h-4" />
              {t('insights.share_report')}
            </button>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold text-gray-900 mb-4">{t('insights.flock_breakdown')}</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {flockBreakdowns.map((flock) => (
                <div
                  key={flock.id}
                  className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{flock.name}</p>
                      <p className="text-sm text-gray-600">
                        {flock.type} • {flock.current_count} birds
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${flock.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(flock.profit, currencyCode)}
                      </p>
                      <p className="text-xs text-gray-600">{t('insights.profit')}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-600">{t('insights.revenue')}</p>
                        <p className="font-semibold text-gray-900">{formatCurrency(flock.revenue, currencyCode)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">{t('insights.expenses')}</p>
                        <p className="font-semibold text-gray-900">{formatCurrency(flock.expenses, currencyCode)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">{t('insights.mortality')}</p>
                        <p className="font-semibold text-gray-900">{flock.mortality}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">{t('insights.current_birds')}</p>
                        <p className="font-semibold text-gray-900">{flock.current_count.toLocaleString()}</p>
                      </div>
                    </div>

                    {flock.eggsCollected > 0 && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-700 mb-1">Egg Production</p>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-gray-600">Collected</p>
                            <p className="font-semibold text-gray-900">{formatEggsCompact(flock.eggsCollected, eggsPerTray)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Sold</p>
                            <p className="font-semibold text-gray-900">{formatEggsCompact(flock.eggsSold, eggsPerTray)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">In Stock</p>
                            <p className="font-semibold text-gray-900">{formatEggsCompact(flock.eggsCollected - flock.eggsSold, eggsPerTray)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {flock.birdsSold > 0 && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-700 mb-1">Bird Sales</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-gray-600">Birds Sold</p>
                            <p className="font-semibold text-purple-900">{flock.birdsSold.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">{t('insights.revenue')}</p>
                            <p className="font-semibold text-green-900">{formatCurrency(flock.birdSalesRevenue, currencyCode)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
