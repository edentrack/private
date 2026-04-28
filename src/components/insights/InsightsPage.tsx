import { Fragment, useState, useEffect, useMemo } from 'react';
import { FileText, Download, DollarSign, Users, TrendingUp, Calendar, ChevronRight, ChevronDown, Loader2, Scale, Egg, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Flock, Expense, MortalityLog, EggCollection } from '../../types/database';
import { formatEggsWithTotal, formatEggsForExport } from '../../utils/eggFormatting';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { usePermissions } from '../../contexts/PermissionsContext';
import { shareViaWhatsApp, formatInsightsForWhatsApp } from '../../utils/whatsappShare';
import { InsightsSkeleton } from '../common/Skeleton';
import { ComprehensiveFarmReport } from '../analytics/ComprehensiveFarmReport';
import { FlockSwitcher } from '../common/FlockSwitcher';
import { EggIntervalTaskTracker } from '../tasks/egg/EggIntervalTaskTracker';

interface WeekData {
  week: number;
  expenses: number;
  eggs: number;
  deaths: number;
  avgWeight: number;
  startDate: string;
  daily: {
    dateLabel: string;
    dateISO: string;
    expenses: number;
    eggs: number;
    deaths: number;
  }[];
}

/** Parse API date (YYYY-MM-DD) as local noon so week boundaries don't shift by timezone. */
function parseLocalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(value);
  return new Date(s + 'T12:00:00');
}

/** Return true if date (local calendar day) is >= start and <= end (inclusive). */
function isDateInRange(date: Date | null, start: Date, end: Date): boolean {
  if (!date || isNaN(date.getTime())) return false;
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface WeightLog {
  id: string;
  flock_id: string;
  average_weight: number;
  date: string;
  sample_size?: number;
}

export function InsightsPage() {
  const { t } = useTranslation();
  const { currentFarm, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(null);
  const [selectedFlock, setSelectedFlock] = useState<Flock | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [mortality, setMortality] = useState<MortalityLog[]>([]);
  const [eggCollections, setEggCollections] = useState<EggCollection[]>([]);
  const [eggSales, setEggSales] = useState<any[]>([]);
  const [birdSales, setBirdSales] = useState<any[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [feedBagsUsed, setFeedBagsUsed] = useState(0);
  const [revenues, setRevenues] = useState<any[]>([]);
  const [profitPoolUsed, setProfitPoolUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const [showShareMenu, setShowShareMenu] = useState(false);

  const hideFinancials = shouldHideFinancialData(currentRole, farmPermissions);
  const currencyCode = currentFarm?.currency_code || 'XAF';
  const eggsPerTray = (currentFarm as any)?.eggs_per_tray || 0;

  const flockKind = selectedFlock?.type || (selectedFlock as any)?.purpose;
  const isLayerFlock = flockKind?.toLowerCase() === 'layer';
  const isBroilerFlock = flockKind?.toLowerCase() === 'broiler';

  // Load flocks + auto-select first one immediately, then load its data in parallel
  useEffect(() => {
    if (!currentFarm?.id) return;
    setLoading(true);
    supabase
      .from('flocks')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = data || [];
        setFlocks(list);
        setLoading(false);
        if (list.length > 0 && !selectedFlockId) {
          setSelectedFlockId(list[0].id);
        }
      });
  }, [currentFarm?.id]);

  useEffect(() => {
    if (selectedFlockId) {
      loadFlockData(selectedFlockId);
    } else {
      setSelectedFlock(null);
      setExpenses([]);
      setMortality([]);
      setEggCollections([]);
      setEggSales([]);
      setBirdSales([]);
      setWeightLogs([]);
      setFeedBagsUsed(0);
      setProfitPoolUsed(0);
      setExpandedWeeks(new Set());
    }
  }, [selectedFlockId]);


  const loadFlockData = async (flockId: string) => {
    if (!currentFarm?.id) return;
    setLoadingData(true);

    try {
      const flock = flocks.find(f => f.id === flockId);
      if (flock) setSelectedFlock(flock);
      const queryStartDate = new Date((flock?.arrival_date || flock?.start_date || new Date()).toString());
      queryStartDate.setDate(queryStartDate.getDate() - 7);
      const queryStartStr = queryStartDate.toISOString().split('T')[0];

      // Wrap each query: one bad response (e.g., schema drift on a column)
      // must not nuke the whole Insights page. Failures log and return [].
      const safe = async (label: string, p: PromiseLike<any>) => {
        try {
          const res: any = await p;
          if (res?.error) {
            console.warn(`[InsightsPage] ${label} failed:`, res.error);
            return { data: [] };
          }
          return res;
        } catch (e) {
          console.warn(`[InsightsPage] ${label} threw:`, e);
          return { data: [] };
        }
      };

      const queries: any[] = [
        safe('expenses', supabase
          .from('expenses')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .eq('flock_id', flockId)),
        safe('mortality_logs', supabase
          .from('mortality_logs')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .eq('flock_id', flockId)),
        safe('inventory_usage', supabase
          .from('inventory_usage')
          .select('quantity_used, usage_date, feed_type_id, feed_type:feed_types(id, unit, kg_per_unit)')
          .eq('farm_id', currentFarm.id)
          .eq('item_type', 'feed')
          .gte('usage_date', queryStartStr)
          .order('usage_date', { ascending: true })),
        safe('revenues', supabase
          .from('revenues')
          .select('amount, source_type, flock_id')
          .eq('farm_id', currentFarm.id)
          .or(`flock_id.eq.${flockId},flock_id.is.null`)),
        safe('bird_sales', supabase
          .from('bird_sales')
          .select('total_amount')
          .eq('farm_id', currentFarm.id)
          .or(`flock_id.eq.${flockId},flock_id.is.null`)),
      ];

      const kind = flock?.type || (flock as any)?.purpose;
      if (kind?.toLowerCase() === 'layer') {
        queries.push(
          safe('egg_collections', supabase
            .from('egg_collections')
            .select('*')
            .eq('farm_id', currentFarm.id)
            .eq('flock_id', flockId))
        );
        queries.push(
          safe('egg_sales', supabase
            .from('egg_sales')
            .select('total_amount, total_eggs, sale_date, sold_on, flock_id')
            .eq('farm_id', currentFarm.id)
            .or(`flock_id.eq.${flockId},flock_id.is.null`))
        );
      }

      if (kind?.toLowerCase() === 'broiler') {
        queries.push(
          safe('weight_logs', supabase
            .from('weight_logs')
            .select('*')
            .eq('farm_id', currentFarm.id)
            .eq('flock_id', flockId)
            .order('date', { ascending: false }))
        );
      }

      // Add paid_from_profit query into the same parallel batch
      queries.push(safe('expenses (paid_from_profit)', supabase
        .from('expenses')
        .select('amount')
        .eq('farm_id', currentFarm.id)
        .eq('flock_id', flockId)
        .eq('paid_from_profit', true)));

      const results = await Promise.all(queries);

      const paidFromProfitRows = results[results.length - 1]?.data;
      const usedFromRevenue = (paidFromProfitRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
      setProfitPoolUsed(usedFromRevenue);

      setExpenses(results[0].data || []);
      setMortality(results[1].data || []);

      // Convert feed usage to kg using farm settings
      const { getFeedConversionSettings, convertFeedToKg } = await import('../../utils/feedConversions');
      const feedSettings = await getFeedConversionSettings(currentFarm.id);
      
      const totalFeedKg = (results[2].data || []).reduce((sum: number, log: any) => {
        const qty = Number(log.quantity_used || 0);
        const feedType = log.feed_type as any;
        const storedUnit = feedType?.unit || feedSettings.feedUnit;
        const kgPerUnit = feedType?.kg_per_unit != null ? Number(feedType.kg_per_unit) : null;
        const settingsForConversion =
          kgPerUnit != null && kgPerUnit > 0
            ? { ...feedSettings, quantityPerBag: kgPerUnit }
            : feedSettings;
        return sum + convertFeedToKg(qty, storedUnit, settingsForConversion);
      }, 0);
      setFeedBagsUsed(totalFeedKg); // Store in kg for calculations

      setRevenues(results[3].data || []);
      setBirdSales(results[4].data || []);

      if (kind?.toLowerCase() === 'layer' && results[5]) {
        setEggCollections(results[5].data || []);
        setEggSales(results[6]?.data || []);
        setWeightLogs([]);
      } else if (kind?.toLowerCase() === 'broiler' && results[5]) {
        setWeightLogs(results[5].data || []);
        setEggCollections([]);
        setEggSales([]);
      } else {
        setEggCollections([]);
        setEggSales([]);
        setWeightLogs([]);
      }
    } catch (error) {
      console.error('Error loading flock data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const metrics = useMemo(() => {
    if (!selectedFlock) {
      return {
        totalExpenses: 0,
        totalRevenue: 0,
        netProfit: 0,
        profitMargin: '0.0',
        costPerBird: 0,
        ageWeeks: 0,
        ageDays: 0,
        birdsAlive: 0,
        initialCount: 0,
        totalMortality: 0,
        mortalityRate: '0.0',
        survivalRate: '100.0',
        totalEggs: 0,
        totalEggsSold: 0,
        productionRate: '0.0',
        productionRateLifetime: '0.0',
        dailyAvgCost: 0,
        feedConversion: '0.00',
        avgWeight: 0,
        totalWeight: 0,
        dailyWeightGain: 0
      };
    }

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalMortality = mortality.reduce((sum, m) => sum + m.count, 0);

    const totalEggs = isLayerFlock ? eggCollections.reduce((sum, c) => {
      return sum + (c.total_eggs || 0);
    }, 0) : 0;

    const totalEggsSold = isLayerFlock ? eggSales.reduce((sum, s) => {
      return sum + (s.total_eggs || 0);
    }, 0) : 0;

    const latestWeight = weightLogs.length > 0 ? weightLogs[0].average_weight : 0;
    const avgWeight = latestWeight || 0;

    const arrivalDate = new Date(selectedFlock.arrival_date || selectedFlock.start_date);
    const now = new Date();
    const ageDays = Math.max(1, Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)));
    const ageWeeks = Math.max(1, Math.floor(ageDays / 7) + 1);

    const initialCount = selectedFlock.initial_count || 0;
    const birdsAlive = selectedFlock.current_count || 0;

    const survivalRate = initialCount > 0
      ? (((initialCount - totalMortality) / initialCount) * 100).toFixed(1)
      : '100.0';
    const mortalityRate = initialCount > 0
      ? ((totalMortality / initialCount) * 100).toFixed(1)
      : '0.0';

    // Production rate: 7-day rolling average so it stays non-zero even if today not logged yet.
    const now7 = new Date();
    const sevenDaysAgo = new Date(now7);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    now7.setHours(23, 59, 59, 999);
    const recent7Collections = isLayerFlock
      ? eggCollections.filter((c: any) => {
          const d = parseLocalDate(String(c.collected_on || c.collection_date || '').slice(0, 10));
          return d && d >= sevenDaysAgo && d <= now7;
        })
      : [];
    const eggs7 = recent7Collections.reduce((sum, c: any) => {
      const total = Number(c.total_eggs ?? 0);
      if (total > 0) return sum + total;
      return sum + Math.max(0, Number(c.trays || 0) * eggsPerTray - Number(c.broken || 0));
    }, 0);
    const days7 = Math.max(1, recent7Collections.length > 0
      ? Math.round((now7.getTime() - sevenDaysAgo.getTime()) / (1000 * 60 * 60 * 24))
      : ageDays);
    const dailyAvgEggs7 = recent7Collections.length > 0 ? eggs7 / days7 : (ageDays > 0 ? totalEggs / ageDays : 0);
    const productionRateCurrent = isLayerFlock && birdsAlive > 0
      ? ((dailyAvgEggs7 / birdsAlive) * 100).toFixed(1)
      : '0.0';

    // Lifetime average kept as context.
    const productionRateLifetime = isLayerFlock && birdsAlive > 0 && totalEggs > 0
      ? (((totalEggs / ageDays) / birdsAlive) * 100).toFixed(1)
      : '0.0';

    const costPerBird = birdsAlive > 0 ? Math.round(totalExpenses / birdsAlive) : 0;
    const dailyAvgCost = ageDays > 0 ? Math.round(totalExpenses / ageDays) : 0;

    const totalWeight = birdsAlive * avgWeight;
    const dailyWeightGain = ageDays > 1 ? Math.round((avgWeight / ageDays) * 1000) : 0;

    const eggSalesRevenue = eggSales.reduce((sum, sale) => sum + (Number(sale.total_amount) || 0), 0);
    const birdSalesRevenue = birdSales.reduce((sum, sale) => sum + (Number(sale.total_amount) || 0), 0);

    // Fallback for legacy rows where sales weren't linked in sales tables for flock-level view.
    const revenueRows = Array.isArray(revenues) ? revenues : [];
    const eggRevenueFallback = revenueRows
      .filter((r: any) => ['egg_sale', 'eggs_sale'].includes(String(r.source_type || '').toLowerCase()))
      .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
    const birdRevenueFallback = revenueRows
      .filter((r: any) => ['bird_sale', 'birds_sale'].includes(String(r.source_type || '').toLowerCase()))
      .reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

    const totalRevenue =
      (eggSalesRevenue > 0 ? eggSalesRevenue : eggRevenueFallback) +
      (birdSalesRevenue > 0 ? birdSalesRevenue : birdRevenueFallback);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0
      ? ((netProfit / totalRevenue) * 100).toFixed(1)
      : '0.0';

    // Convert feed bags to kg using farm settings (async calculation)
    // For now, we'll calculate this in the loadData function and pass it as a prop
    // This is a useMemo so we need to handle async differently
    // We'll calculate feedBagsUsed in kg already in loadData
    const totalFeedKg = feedBagsUsed; // feedBagsUsed should already be in kg from loadData
    let feedConversion = '0.00';
    if (isBroilerFlock && totalWeight > 0) {
      feedConversion = (totalFeedKg / totalWeight).toFixed(2);
    } else if (isLayerFlock && totalEggs > 0) {
      const eggWeightKg = totalEggs * 0.06;
      feedConversion = (totalFeedKg / eggWeightKg).toFixed(2);
    }

    return {
      totalExpenses,
      totalRevenue,
      netProfit,
      profitMargin,
      costPerBird,
      ageWeeks,
      ageDays,
      birdsAlive,
      initialCount,
      totalMortality,
      mortalityRate,
      survivalRate,
      totalEggs,
      totalEggsSold,
      productionRate: productionRateCurrent,
      productionRateLifetime,
      dailyAvgCost,
      feedConversion,
      avgWeight,
      totalWeight,
      dailyWeightGain
    };
  }, [selectedFlock, expenses, mortality, eggCollections, eggSales, birdSales, weightLogs, eggsPerTray, feedBagsUsed, revenues, isLayerFlock, isBroilerFlock]);

  const weeklyData = useMemo(() => {
    if (!selectedFlock) return [];

    const arrivalRaw = selectedFlock.arrival_date || selectedFlock.start_date;
    const arrivalDate = parseLocalDate(arrivalRaw) || new Date(arrivalRaw);
    arrivalDate.setHours(0, 0, 0, 0);
    const now = new Date();
    const totalDays = Math.max(1, Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)));
    const totalWeeks = Math.max(1, Math.floor(totalDays / 7) + 1);

    const weeks: WeekData[] = [];

    for (let week = 1; week <= totalWeeks; week++) {
      const weekStartDate = new Date(arrivalDate);
      weekStartDate.setDate(arrivalDate.getDate() + (week - 1) * 7);
      weekStartDate.setHours(0, 0, 0, 0);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);
      weekEndDate.setHours(23, 59, 59, 999);

      const weekExpenses = expenses
        .filter(e => isDateInRange(parseLocalDate(e.incurred_on || (e as any).date), weekStartDate, weekEndDate))
        .reduce((sum, e) => sum + e.amount, 0);

      const collDateField = (c: EggCollection & { collection_date?: string }) => c.collected_on || c.collection_date;
      const weekEggs = isLayerFlock ? eggCollections
        .filter(c => isDateInRange(parseLocalDate(collDateField(c)), weekStartDate, weekEndDate))
        .reduce((sum, c) => {
          const trays = c.trays || 0;
          const broken = c.broken || 0;
          const total = (c as any).total_eggs ?? (trays * (eggsPerTray || 30)) - broken;
          return sum + total;
        }, 0) : 0;

      const weekDeaths = mortality
        .filter(m => isDateInRange(parseLocalDate(m.event_date), weekStartDate, weekEndDate))
        .reduce((sum, m) => sum + m.count, 0);

      const weekWeightLogs = isBroilerFlock ? weightLogs.filter(w =>
        isDateInRange(parseLocalDate(w.date), weekStartDate, weekEndDate)
      ) : [];
      const weekAvgWeight = weekWeightLogs.length > 0
        ? weekWeightLogs.reduce((sum, w) => sum + w.average_weight, 0) / weekWeightLogs.length
        : 0;

      const daily = Array.from({ length: 7 }).map((_, idx) => {
        const day = new Date(weekStartDate);
        day.setDate(weekStartDate.getDate() + idx);
        day.setHours(12, 0, 0, 0);
        const dayISO = toLocalISODate(day);

        const dayExpenses = expenses
          .filter(e => {
            const d = parseLocalDate(e.incurred_on || (e as any).date);
            return d ? toLocalISODate(d) === dayISO : false;
          })
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        const collDateField = (c: EggCollection & { collection_date?: string }) => c.collected_on || c.collection_date;
        const dayEggs = isLayerFlock
          ? eggCollections
              .filter(c => {
                const d = parseLocalDate(collDateField(c));
                return d ? toLocalISODate(d) === dayISO : false;
              })
              .reduce((sum, c) => {
                const trays = c.trays || 0;
                const broken = c.broken || 0;
                const total = (c as any).total_eggs ?? (trays * (eggsPerTray || 30)) - broken;
                return sum + total;
              }, 0)
          : 0;

        const dayDeaths = mortality
          .filter(m => {
            const d = parseLocalDate(m.event_date);
            return d ? toLocalISODate(d) === dayISO : false;
          })
          .reduce((sum, m) => sum + Number(m.count || 0), 0);

        return {
          dateISO: dayISO,
          dateLabel: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          expenses: dayExpenses,
          eggs: dayEggs,
          deaths: dayDeaths,
        };
      });

      weeks.push({
        week,
        expenses: weekExpenses,
        eggs: weekEggs,
        deaths: weekDeaths,
        avgWeight: weekAvgWeight,
        startDate: weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        daily
      });
    }

    return weeks;
  }, [selectedFlock, expenses, eggCollections, mortality, weightLogs, eggsPerTray, isLayerFlock, isBroilerFlock]);

  const handlePDFExport = () => {
    window.print();
  };

  const handleCSVExport = () => {
    if (!selectedFlock) return;

    const csvContent: string[][] = [
      ['Insights Report'],
      ['Flock Name', selectedFlock.name],
      ['Flock Type', selectedFlock.type],
      ['Report Date', new Date().toLocaleDateString()],
      [''],
      ['Financial Summary'],
      ['Metric', 'Value', 'Currency'],
      ['Total Expenses', metrics.totalExpenses.toString(), currencyCode],
      ['Total Revenue', metrics.totalRevenue.toString(), currencyCode],
      ['Net Profit', metrics.netProfit.toString(), currencyCode],
      ['Profit Margin', `${metrics.profitMargin}%`, ''],
      ['Cost per Bird', metrics.costPerBird.toString(), currencyCode],
      ['Daily Average Cost', metrics.dailyAvgCost.toString(), currencyCode],
      [''],
      ['Production Metrics'],
      ['Metric', 'Value', 'Unit'],
      ['Current Age', `${metrics.ageWeeks} weeks (${metrics.ageDays} days)`, ''],
      ['Birds Alive', `${metrics.birdsAlive}/${metrics.initialCount}`, 'birds'],
      ['Survival Rate', `${metrics.survivalRate}%`, ''],
      ['Mortality', `${metrics.totalMortality} (${metrics.mortalityRate}%)`, 'birds'],
      ['Feed Consumed', feedBagsUsed.toString(), 'kg'],
    ];

    if (isLayerFlock) {
      const eggsFormatted = formatEggsForExport(metrics.totalEggs, eggsPerTray);
      csvContent.push(
        ['Eggs Collected', metrics.totalEggs.toString(), 'eggs'],
        ['Eggs Collected (Formatted)', eggsFormatted, ''],
        ['Production Rate', `${metrics.productionRate}%`, '']
      );
    }

    if (isBroilerFlock) {
      csvContent.push(
        ['Average Weight', metrics.avgWeight.toFixed(2), 'kg'],
        ['Total Weight', metrics.totalWeight.toFixed(1), 'kg'],
        ['Daily Weight Gain', metrics.dailyWeightGain.toString(), 'g/day']
      );
    }

    csvContent.push([''], ['Week-by-Week Breakdown']);

    if (isLayerFlock) {
      csvContent.push(['Week', `Expenses (${currencyCode})`, 'Eggs', 'Deaths']);
      weeklyData.forEach(w => {
        csvContent.push([`Week ${w.week}`, w.expenses.toString(), w.eggs.toString(), w.deaths.toString()]);
      });
    } else {
      csvContent.push(['Week', `Expenses (${currencyCode})`, 'Avg Weight (kg)', 'Deaths']);
      weeklyData.forEach(w => {
        csvContent.push([`Week ${w.week}`, w.expenses.toString(), w.avgWeight.toFixed(2), w.deaths.toString()]);
      });
    }

    const csv = csvContent.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insights_${selectedFlock.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWhatsAppShare = () => {
    if (!selectedFlock || !currentFarm) return;

    const message = formatInsightsForWhatsApp(
      metrics,
      { name: selectedFlock.name, type: selectedFlock.type },
      currentFarm.name || 'My Farm',
      currencyCode,
      eggsPerTray
    );

    shareViaWhatsApp(message);
  };

  const handleSharePeriod = (period: 'daily' | 'weekly' | 'monthly' | 'cycle') => {
    if (!selectedFlock || !currentFarm) return;
    setShowShareMenu(false);

    if (period === 'cycle') {
      handleWhatsAppShare();
      return;
    }

    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (period === 'weekly') start.setDate(start.getDate() - 6);
    if (period === 'monthly') start.setDate(start.getDate() - 29);

    const inRange = (dateStr: string | undefined) => {
      if (!dateStr) return false;
      const d = parseLocalDate(dateStr);
      if (!d) return false;
      return d >= start && d <= now;
    };

    const periodExpenses = expenses.filter(e => inRange(e.incurred_on || (e as any).date));
    const periodMortality = mortality.filter(m => inRange(m.event_date));
    const periodEggs = eggCollections.filter(c => inRange((c as any).collected_on || (c as any).collection_date));
    const periodEggSales = eggSales.filter(s => inRange(s.sale_date));
    const periodBirdSales = birdSales.filter(s => inRange(s.sale_date));

    const totalExp = periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalDead = periodMortality.reduce((s, m) => s + m.count, 0);
    const totalEggsCollected = periodEggs.reduce((s, c) => s + ((c as any).total_eggs || 0), 0);
    const eggRevenue = periodEggSales.reduce((s, s2) => s + Number(s2.total_amount || 0), 0);
    const birdRevenue = periodBirdSales.reduce((s, s2) => s + Number(s2.total_amount || 0), 0);
    const totalRev = eggRevenue + birdRevenue;
    const netProfit = totalRev - totalExp;

    const labels: Record<string, string> = {
      daily: `Daily Report — ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      weekly: `Weekly Report — Last 7 Days`,
      monthly: `Monthly Report — Last 30 Days`,
    };

    const trays = eggsPerTray > 0 ? Math.floor(totalEggsCollected / eggsPerTray) : 0;
    const loose = eggsPerTray > 0 ? totalEggsCollected % eggsPerTray : totalEggsCollected;

    let msg = `*🌿 EDENTRACK FARM REPORT*\n`;
    msg += `*${labels[period]}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `*Farm:* ${currentFarm.name || 'My Farm'}\n`;
    msg += `*Flock:* ${selectedFlock.name} (${selectedFlock.type})\n\n`;

    if (isLayerFlock) {
      const eggTrayStr = eggsPerTray > 0 ? ` (${trays} trays + ${loose})` : '';
      msg += `🥚 *Eggs Collected:* ${totalEggsCollected.toLocaleString()}${eggTrayStr}\n`;
    }
    msg += `💀 *Mortality:* ${totalDead} bird${totalDead !== 1 ? 's' : ''}\n`;
    if (!hideFinancials) {
      msg += `💸 *Expenses:* ${totalExp.toLocaleString()} ${currencyCode}\n`;
      msg += `💰 *Revenue:* ${totalRev.toLocaleString()} ${currencyCode}\n`;
      msg += `📊 *Net:* ${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()} ${currencyCode}\n`;
    }
    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Sent via Edentrack · ${new Date().toLocaleString()}`;

    shareViaWhatsApp(msg);
  };

  const displayedWeeks = showAllWeeks ? weeklyData : weeklyData.slice(0, 4);
  const remainingProfitBalance = metrics.totalRevenue - profitPoolUsed;
  const toggleWeekExpanded = (week: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };
  const eggDisplay = formatEggsWithTotal(metrics.totalEggs, eggsPerTray);
  const sellKeepSignal = useMemo(() => {
    const feedConv = Number(metrics.feedConversion || 0);
    const profitMargin = Number(metrics.profitMargin || 0);
    const netProfit = Number(metrics.netProfit || 0);

    if (isBroilerFlock) {
      if ((feedConv > 2.6 && profitMargin < 5) || netProfit < 0) {
        return {
          label: 'Sell soon',
          reason: 'Feed conversion is high while margin is weak/negative.',
          tone: 'bg-red-50 border-red-200 text-red-800',
        };
      }
      if (feedConv > 2.2 || profitMargin < 12) {
        return {
          label: 'Monitor closely',
          reason: 'Efficiency is softening; check growth and market price this week.',
          tone: 'bg-amber-50 border-amber-200 text-amber-800',
        };
      }
      return {
        label: 'Keep growing',
        reason: 'Efficiency and margin are still in a healthy range.',
        tone: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      };
    }

    // Layers: "sell" means replace/cull planning, with lifecycle sensitivity.
    const currentWeek = Number(metrics.ageWeeks || 0);
    const firstEggWeek = weeklyData.find((w) => Number(w.eggs || 0) > 0)?.week ?? 18;
    const rampEndWeek = firstEggWeek + 6; // ramp-up buffer after first lay

    const eggWeeks = weeklyData
      .filter((w) => Number(w.eggs || 0) > 0)
      .map((w) => ({ week: w.week, eggs: Number(w.eggs || 0) }));
    const recent = eggWeeks.slice(-4);
    const recentAvg = recent.length > 0 ? recent.reduce((s, x) => s + x.eggs, 0) / recent.length : 0;
    const prev = eggWeeks.slice(-8, -4);
    const prevAvg = prev.length > 0 ? prev.reduce((s, x) => s + x.eggs, 0) / prev.length : 0;
    const trendDropPct = prevAvg > 0 ? ((prevAvg - recentAvg) / prevAvg) * 100 : 0;
    const latestEggs = recent.length > 0 ? recent[recent.length - 1].eggs : 0;
    const peakEggs = eggWeeks.length > 0 ? Math.max(...eggWeeks.map((x) => x.eggs)) : 0;
    const fromPeakDropPct = peakEggs > 0 ? ((peakEggs - latestEggs) / peakEggs) * 100 : 0;
    const postRamp = currentWeek >= rampEndWeek;
    const decliningTrend = trendDropPct >= 12 || fromPeakDropPct >= 15;

    if (currentWeek < firstEggWeek || eggWeeks.length === 0) {
      return {
        label: 'Keep flock',
        reason: `Pre-lay phase (typically before week ${firstEggWeek}); no sell signal yet.`,
        tone: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      };
    }

    if (!postRamp) {
      return {
        label: 'Keep flock',
        reason: `Ramp-up phase after first lay (week ${firstEggWeek}+). Track upward trend before decisions.`,
        tone: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      };
    }

    const totalRevenue = Number(metrics.totalRevenue || 0);
    const totalExpenses = Number(metrics.totalExpenses || 0);
    const weeksPostRamp = Math.max(currentWeek - rampEndWeek, 1);

    // Data confidence check: suppress negative signals if revenue looks incomplete.
    // If expenses exist but revenue is <20% of expenses, data is almost certainly incomplete.
    if (totalExpenses > 0 && totalRevenue < totalExpenses * 0.2 && weeksPostRamp > 3) {
      return {
        label: 'Insufficient data',
        reason: `Revenue records appear incomplete (${totalRevenue.toLocaleString()} vs ${totalExpenses.toLocaleString()} in expenses). Log your egg sales to get an accurate signal.`,
        tone: 'bg-gray-50 border-gray-200 text-gray-600',
      };
    }

    const hasRevenueData = totalRevenue > 0;
    if ((decliningTrend && feedConv > 2.9) || (hasRevenueData && netProfit < 0 && totalRevenue >= totalExpenses * 0.2)) {
      return {
        label: 'Replace soon',
        reason: 'Post-ramp production trend is dropping while efficiency/margin is weakening.',
        tone: 'bg-red-50 border-red-200 text-red-800',
      };
    }
    if (decliningTrend || feedConv > 2.7 || Number(metrics.productionRate || 0) < 60) {
      return {
        label: 'Monitor closely',
        reason: 'Lay curve shows early softening; monitor next 1-2 weeks before replacement.',
        tone: 'bg-amber-50 border-amber-200 text-amber-800',
      };
    }
    return {
      label: 'Keep flock',
      reason: 'Current feed-to-output performance is acceptable.',
      tone: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    };
  }, [isBroilerFlock, metrics.feedConversion, metrics.netProfit, metrics.profitMargin, metrics.productionRate, metrics.ageWeeks, weeklyData]);

  if (loading) {
    return <InsightsSkeleton />;
  }

  if (flocks.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('insights.title')}</h1>
          <p className="text-gray-500 mt-1">{t('insights.subtitle')}</p>
        </div>
        <div className="section-card text-center py-12">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('insights.no_flocks_available')}</h3>
          <p className="text-gray-500">{t('insights.create_first_flock_insights')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          nav, .no-print, .sidebar, header, footer, button { display: none !important; }
          @page { size: A4; margin: 15mm; }
          .print-section { page-break-inside: avoid; margin-bottom: 16px; }
          body { background: white !important; }
          .section-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
        }
      `}</style>

      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('insights.title')}</h1>
            <p className="text-gray-500 mt-1">{t('insights.subtitle')}</p>
          </div>

          <div className="flex items-center gap-3">
            <FlockSwitcher
              selectedFlockId={selectedFlockId}
              onFlockChange={setSelectedFlockId}
              showAllOption={true}
              label=""
            />

            <button
              onClick={handlePDFExport}
              className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              title="Export PDF"
            >
              <FileText className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={handleCSVExport}
              className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              title="Export CSV"
            >
              <Download className="w-5 h-5 text-gray-600" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-xl transition-colors text-sm font-medium"
                title="Share via WhatsApp"
                disabled={!selectedFlock}
              >
                <MessageCircle className="w-4 h-4" />
                Share
              </button>
              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowShareMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-48">
                    <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">Send via WhatsApp</p>
                    {([
                      { key: 'daily', label: "📅 Today's Report" },
                      { key: 'weekly', label: '📆 Weekly Report' },
                      { key: 'monthly', label: '🗓️ Monthly Report' },
                      { key: 'cycle', label: '📊 Full Cycle Report' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => handleSharePeriod(opt.key)}
                        className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-800 transition-colors"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : selectedFlock ? (
          <div className="space-y-6">
            {selectedFlock && (
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg w-fit">
                {isBroilerFlock ? (
                  <Scale className="w-4 h-4 text-orange-600" />
                ) : (
                  <Egg className="w-4 h-4 text-blue-600" />
                )}
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {selectedFlock.type} {t('insights.flock')}
                </span>
                <span className="text-xs text-gray-500">
                  {isBroilerFlock ? t('insights.meat_production') : t('insights.egg_production')}
                </span>
              </div>
            )}

            {!hideFinancials && (
              <div className="print-section rounded-2xl p-6" style={{ backgroundColor: '#FFF9E6' }}>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  {t('insights.financial_overview')}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/60 rounded-xl p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.expenses')}</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalExpenses.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">{currencyCode}</p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.revenue')}</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.totalRevenue.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">{currencyCode}</p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.net_profit')}</p>
                    <p className={`text-2xl font-bold ${metrics.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {metrics.netProfit.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">{currencyCode}</p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Revenue Balance Left</p>
                    <p className={`text-2xl font-bold ${remainingProfitBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {remainingProfitBalance.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">{currencyCode}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/40 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{t('insights.profit_margin')}</p>
                    <p className="text-lg font-semibold text-gray-900">{metrics.profitMargin}%</p>
                  </div>
                  <div className="bg-white/40 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{t('insights.cost_per_bird_alive')}</p>
                    <p className="text-lg font-semibold text-gray-900">{metrics.costPerBird.toLocaleString()} {currencyCode}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="print-section rounded-2xl p-6" style={{ backgroundColor: '#F0F9F4' }}>
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t('insights.production_metrics')}
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white/60 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.current_age')}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {metrics.ageWeeks} {t('insights.weeks')}
                    {metrics.ageDays > 0 && <span className="text-lg font-normal text-gray-400 ml-1.5">{metrics.ageDays}d</span>}
                  </p>
                </div>
                <div className="bg-white/60 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.birds_alive')}</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.birdsAlive.toLocaleString()} / {metrics.initialCount.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">({metrics.survivalRate}%)</p>
                </div>
                <div className="bg-white/60 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.mortality')}</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.totalMortality} {t('dashboard.birds')}</p>
                  <p className="text-sm text-gray-500">({metrics.mortalityRate}%)</p>
                </div>
                <div className="bg-white/60 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.feed_consumed')}</p>
                  <p className="text-2xl font-bold text-gray-900">{Math.round(feedBagsUsed)} kg</p>
                </div>

                {isLayerFlock && (
                  <>
                    <div className="bg-white/60 rounded-xl p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.eggs_collected')}</p>
                      <p className="text-2xl font-bold text-gray-900">{eggDisplay.primary}</p>
                      {eggDisplay.secondary && (
                        <p className="text-sm text-gray-500">{eggDisplay.secondary}</p>
                      )}
                    </div>
                    <div className="bg-white/60 rounded-xl p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.production_rate')}</p>
                      <p className="text-2xl font-bold text-gray-900">{metrics.productionRate}%</p>
                      <p className="text-sm text-gray-500">Lay rate</p>
                    </div>

                      <div className="bg-white/60 rounded-2xl p-4 md:col-span-3 col-span-2">
                        <EggIntervalTaskTracker readOnly />
                      </div>
                  </>
                )}

                {isBroilerFlock && (
                  <>
                    <div className="bg-white/60 rounded-xl p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.average_weight')}</p>
                      <p className="text-2xl font-bold text-gray-900">{metrics.avgWeight.toFixed(2)} kg</p>
                      <p className="text-sm text-gray-500">{t('insights.per_bird')}</p>
                    </div>
                    <div className="bg-white/60 rounded-xl p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.total_weight')}</p>
                      <p className="text-2xl font-bold text-gray-900">{metrics.totalWeight.toFixed(0)} kg</p>
                      <p className="text-sm text-gray-500">{t('insights.ready_for_market')}</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="print-section rounded-2xl p-6" style={{ backgroundColor: '#EFF6FF' }}>
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {t('insights.efficiency_metrics')}
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/60 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.feed_conversion')}</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.feedConversion}</p>
                  <p className="text-sm text-gray-500">
                    {isBroilerFlock ? t('insights.kg_feed_per_kg_meat') : t('insights.kg_feed_per_kg_eggs')}
                  </p>
                </div>
                {!hideFinancials && (
                  <div className="bg-white/60 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.cost_efficiency')}</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.costPerBird.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">{currencyCode}/{t('dashboard.birds')}</p>
                  </div>
                )}
                <div className="bg-white/60 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.survival_rate')}</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.survivalRate}%</p>
                </div>
                {!hideFinancials && (
                  <div className="bg-white/60 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.daily_avg_cost')}</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.dailyAvgCost.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">{currencyCode}/{t('insights.per_day')}</p>
                  </div>
                )}
                {isBroilerFlock && (
                  <div className="bg-white/60 rounded-xl p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{t('insights.daily_weight_gain')}</p>
                    <p className="text-2xl font-bold text-gray-900">{metrics.dailyWeightGain}</p>
                    <p className="text-sm text-gray-500">{t('insights.grams_per_day')}</p>
                  </div>
                )}
                <div className={`col-span-2 md:col-span-4 rounded-xl border p-4 ${sellKeepSignal.tone}`}>
                  <p className="text-xs uppercase tracking-wide mb-1">Sell/Keep signal</p>
                  <p className="text-lg font-bold">{sellKeepSignal.label}</p>
                  <p className="text-sm opacity-90 mt-0.5">{sellKeepSignal.reason}</p>
                </div>
              </div>
            </div>

            {weeklyData.length > 0 && (
              <div className="print-section section-card">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {t('insights.week_by_week_breakdown')}
                </h2>

                <div className="overflow-x-auto mx-0 sm:-mx-6">
                  <table className="w-full min-w-[420px] sm:min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('insights.week')}</th>
                        {!hideFinancials && (
                          <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('insights.expenses')} ({currencyCode})</th>
                        )}
                        {isLayerFlock && (
                          <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('dashboard.eggs')}</th>
                        )}
                        {isBroilerFlock && (
                          <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('insights.avg_weight_kg')}</th>
                        )}
                        <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('insights.deaths')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {displayedWeeks.map((w) => {
                        const isExpanded = expandedWeeks.has(w.week);
                        return (
                          <Fragment key={`week-${w.week}`}>
                            <tr key={`week-${w.week}`} className="hover:bg-gray-50/50">
                              <td className="px-6 py-3 text-sm font-medium text-gray-900">
                                <button
                                  type="button"
                                  onClick={() => toggleWeekExpanded(w.week)}
                                  className="inline-flex items-center gap-2 text-left"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                  )}
                                  <span>
                                    {t('insights.week')} {w.week}
                                    <span className="text-gray-400 ml-2 text-xs">{w.startDate}</span>
                                  </span>
                                </button>
                              </td>
                              {!hideFinancials && (
                                <td className="px-6 py-3 text-sm text-right text-gray-900">{w.expenses.toLocaleString()}</td>
                              )}
                              {isLayerFlock && (
                                <td className="px-6 py-3 text-sm text-right text-gray-900">{w.eggs.toLocaleString()}</td>
                              )}
                              {isBroilerFlock && (
                                <td className="px-6 py-3 text-sm text-right text-gray-900">
                                  {w.avgWeight > 0 ? w.avgWeight.toFixed(2) : '-'}
                                </td>
                              )}
                              <td className={`px-6 py-3 text-sm text-right ${w.deaths > 0 ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                                {w.deaths}
                              </td>
                            </tr>
                            {isExpanded && w.daily.map((d) => (
                              <tr key={`week-${w.week}-${d.dateISO}`} className="bg-gray-50/70">
                                <td className="pl-12 pr-6 py-2 text-xs text-gray-700">
                                  {d.dateLabel}
                                </td>
                                {!hideFinancials && (
                                  <td className="px-6 py-2 text-xs text-right text-gray-700">
                                    {d.expenses.toLocaleString()}
                                  </td>
                                )}
                                {isLayerFlock && (
                                  <td className="px-6 py-2 text-xs text-right text-gray-700">
                                    {d.eggs.toLocaleString()}
                                  </td>
                                )}
                                {isBroilerFlock && (
                                  <td className="px-6 py-2 text-xs text-right text-gray-500">-</td>
                                )}
                                <td className={`px-6 py-2 text-xs text-right ${d.deaths > 0 ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                                  {d.deaths}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {weeklyData.length > 4 && (
                  <button
                    onClick={() => setShowAllWeeks(!showAllWeeks)}
                    className="mt-4 w-full py-2 text-sm font-medium text-[#3D5F42] hover:text-[#2D4F32] flex items-center justify-center gap-1 no-print"
                  >
                    {showAllWeeks ? t('insights.show_less') : t('insights.view_full_history', { count: weeklyData.length }) + ` (${weeklyData.length} ${t('insights.weeks')})`}
                    <ChevronRight className={`w-4 h-4 transition-transform ${showAllWeeks ? 'rotate-90' : ''}`} />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="section-card text-center py-8">
              <TrendingUp className="w-12 h-12 text-blue-500 mx-auto mb-3" />
              <h3 className="text-xl font-semibold text-gray-900 mb-1">{t('insights.farm_wide_analytics')}</h3>
              <p className="text-gray-500">{t('insights.viewing_comprehensive_data')}</p>
            </div>
            <ComprehensiveFarmReport />
          </div>
        )}
      </div>
    </>
  );
}
