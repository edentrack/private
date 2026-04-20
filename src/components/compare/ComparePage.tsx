import { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Download, Trophy, Heart, TrendingUp, Lightbulb, ChevronDown, Check, AlertCircle, X, Plus, BarChart3, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock, Expense, MortalityLog } from '../../types/database';
import { getCurrencySymbol } from '../../utils/currency';

interface ComparePageProps {
  onNavigate: (view: string) => void;
}

interface FlockMetrics {
  flock: Flock;
  totalExpenses: number;
  totalMortality: number;
  mortalityRate: number;
  costPerBird: number;
  ageWeeks: number;
  weeklyExpenses: Map<number, number>;
  avgCostPerWeek: number;
  survivalRate: number;
  feedEfficiency?: number; // Feed consumed per bird per week
  revenue?: number;
  profit?: number;
  profitMargin?: number;
}

export function ComparePage({ onNavigate }: ComparePageProps) {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [selectedFlockIds, setSelectedFlockIds] = useState<string[]>([]);
  const [flockMetrics, setFlockMetrics] = useState<Map<string, FlockMetrics>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState<Set<number>>(new Set());

  const currencySymbol = getCurrencySymbol(currentFarm?.currency_code || 'XAF');
  const currencyCode = currentFarm?.currency_code || 'XAF';

  useEffect(() => {
    loadFlocks();
  }, [currentFarm?.id]);

  useEffect(() => {
    selectedFlockIds.forEach(flockId => {
      if (flockId && !flockMetrics.has(flockId)) {
        loadFlockMetrics(flockId);
      }
    });
  }, [selectedFlockIds]);

  const loadFlocks = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('created_at', { ascending: false });

      const flockList = data || [];
      setFlocks(flockList);

      // Auto-select first 2 flocks if available
      if (flockList.length >= 2) {
        setSelectedFlockIds([flockList[0].id, flockList[1].id]);
      } else if (flockList.length === 1) {
        setSelectedFlockIds([flockList[0].id]);
      }
    } catch (error) {
      console.error('Error loading flocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFlockMetrics = async (flockId: string) => {
    if (!flockId || !currentFarm?.id) return;
    setLoadingMetrics(true);

    try {
      const flock = flocks.find(f => f.id === flockId);
      if (!flock) return;

      const [expensesRes, mortalityRes, salesRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .eq('flock_id', flockId),
        supabase
          .from('mortality_logs')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .eq('flock_id', flockId),
        supabase
          .from('sales')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .eq('flock_id', flockId)
      ]);

      const expenses: Expense[] = expensesRes.data || [];
      const mortality: MortalityLog[] = mortalityRes.data || [];
      const sales: any[] = salesRes.data || [];

      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
      const totalMortality = mortality.reduce((sum, m) => sum + m.count, 0);
      const mortalityRate = flock.initial_count > 0
        ? (totalMortality / flock.initial_count) * 100
        : 0;
      const survivalRate = 100 - mortalityRate;

      const arrivalDate = new Date(flock.arrival_date || flock.start_date);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
      const ageWeeks = Math.max(1, Math.floor(diffDays / 7) + 1);

      const weeklyExpenses = new Map<number, number>();
      expenses.forEach(expense => {
        const expenseDate = new Date(expense.date || flock.arrival_date || flock.start_date);
        const daysSinceArrival = Math.floor((expenseDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
        const week = Math.max(1, Math.floor(daysSinceArrival / 7) + 1);
        weeklyExpenses.set(week, (weeklyExpenses.get(week) || 0) + expense.amount);
      });

      const costPerBird = flock.current_count > 0 ? totalExpenses / flock.current_count : 0;
      const avgCostPerWeek = ageWeeks > 0 ? totalExpenses / ageWeeks : 0;

      // Calculate revenue and profit if sales data available
      const revenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const profit = revenue - totalExpenses;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      // Estimate feed efficiency (simplified - would need feed consumption data)
      const feedExpenses = expenses.filter(e => e.category === 'feed').reduce((sum, e) => sum + e.amount, 0);
      const feedEfficiency = flock.current_count > 0 && ageWeeks > 0 
        ? feedExpenses / (flock.current_count * ageWeeks) 
        : 0;

      const metrics: FlockMetrics = {
        flock,
        totalExpenses,
        totalMortality,
        mortalityRate,
        costPerBird,
        ageWeeks,
        weeklyExpenses,
        avgCostPerWeek,
        survivalRate,
        feedEfficiency,
        revenue,
        profit,
        profitMargin
      };

      setFlockMetrics(prev => new Map(prev).set(flockId, metrics));
    } catch (error) {
      console.error('Error loading flock metrics:', error);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const addFlock = () => {
    const availableFlockIds = flocks.map(f => f.id).filter(id => !selectedFlockIds.includes(id));
    if (availableFlockIds.length > 0) {
      setSelectedFlockIds([...selectedFlockIds, availableFlockIds[0]]);
    }
  };

  const removeFlock = (index: number) => {
    setSelectedFlockIds(selectedFlockIds.filter((_, i) => i !== index));
    setOpenDropdowns(new Set());
  };

  const updateFlockSelection = (index: number, flockId: string) => {
    const newSelection = [...selectedFlockIds];
    newSelection[index] = flockId;
    setSelectedFlockIds(newSelection);
    setOpenDropdowns(new Set());
  };

  const formatCurrency = (amount: number) => {
    return `${currencySymbol}${amount.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const selectedMetrics = useMemo(() => {
    return selectedFlockIds
      .map(id => flockMetrics.get(id))
      .filter((m): m is FlockMetrics => m !== undefined);
  }, [selectedFlockIds, flockMetrics]);

  // Statistical analysis
  const statistics = useMemo(() => {
    if (selectedMetrics.length === 0) return null;

    const costPerBirdValues = selectedMetrics.map(m => m.costPerBird);
    const mortalityRates = selectedMetrics.map(m => m.mortalityRate);
    const survivalRates = selectedMetrics.map(m => m.survivalRate);
    const totalExpensesValues = selectedMetrics.map(m => m.totalExpenses);
    const avgCostPerWeekValues = selectedMetrics.map(m => m.avgCostPerWeek);

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const min = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : 0;
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : 0;

    return {
      avgCostPerBird: avg(costPerBirdValues),
      minCostPerBird: min(costPerBirdValues),
      maxCostPerBird: max(costPerBirdValues),
      avgMortalityRate: avg(mortalityRates),
      avgSurvivalRate: avg(survivalRates),
      avgTotalExpenses: avg(totalExpensesValues),
      avgCostPerWeek: avg(avgCostPerWeekValues),
      bestCostPerBird: selectedMetrics.find(m => m.costPerBird === min(costPerBirdValues)),
      worstCostPerBird: selectedMetrics.find(m => m.costPerBird === max(costPerBirdValues)),
      bestSurvival: selectedMetrics.find(m => m.survivalRate === Math.max(...survivalRates)),
      worstSurvival: selectedMetrics.find(m => m.mortalityRate === Math.max(...mortalityRates))
    };
  }, [selectedMetrics]);

  const weeklyComparison = useMemo(() => {
    if (selectedMetrics.length === 0) return [];

    const allWeeks = new Set<number>();
    selectedMetrics.forEach(metrics => {
      metrics.weeklyExpenses.forEach((_, week) => allWeeks.add(week));
    });

    return Array.from(allWeeks).sort((a, b) => a - b).map(week => {
      const costs = selectedMetrics.map(m => m.weeklyExpenses.get(week) || 0);
      const minCost = Math.min(...costs);
      const winners = selectedMetrics
        .map((m, i) => ({ metrics: m, index: i, cost: costs[i] }))
        .filter(item => item.cost === minCost && item.cost > 0)
        .map(item => item.index);

      return { week, costs, winners, minCost, maxCost: Math.max(...costs) };
    });
  }, [selectedMetrics]);

  const insights = useMemo(() => {
    if (selectedMetrics.length === 0) return [];
    if (selectedMetrics.length < 2) return [];

    const results: Array<{ icon: typeof Trophy; color: string; title: string; text: string }> = [];

    // Most cost efficient
    if (statistics?.bestCostPerBird) {
      const best = statistics.bestCostPerBird;
      const avgCost = statistics.avgCostPerBird;
      const savings = avgCost - best.costPerBird;
      const pctSavings = avgCost > 0 ? ((savings / avgCost) * 100).toFixed(0) : '0';

      results.push({
        icon: Trophy,
        color: 'text-amber-600 bg-amber-50',
        title: t('compare.most_cost_efficient') || 'Most Cost Efficient',
        text: t('compare.insight_most_efficient', { 
          flock: best.flock.name, 
          avg: formatCurrency(avgCost),
          savings: pctSavings 
        }) || `${best.flock.name} is ${pctSavings}% below average (${formatCurrency(best.costPerBird)} vs ${formatCurrency(avgCost)} avg)`
      });
    }

    // Best survival rate
    if (statistics?.bestSurvival) {
      const best = statistics.bestSurvival;
      const avgSurvival = statistics.avgSurvivalRate;

      results.push({
        icon: Heart,
        color: 'text-rose-600 bg-rose-50',
        title: t('compare.best_survival_rate') || 'Best Survival Rate',
        text: t('compare.insight_best_survival', { 
          flock: best.flock.name, 
          rate: best.survivalRate.toFixed(1),
          avg: avgSurvival.toFixed(1)
        }) || `${best.flock.name} has ${best.survivalRate.toFixed(1)}% survival (avg: ${avgSurvival.toFixed(1)}%)`
      });
    }

    // Cost efficiency spread
    if (statistics && selectedMetrics.length >= 3) {
      const spread = statistics.maxCostPerBird - statistics.minCostPerBird;
      const spreadPct = statistics.minCostPerBird > 0 
        ? ((spread / statistics.minCostPerBird) * 100).toFixed(0) 
        : '0';

      results.push({
        icon: BarChart3,
        color: 'text-blue-600 bg-blue-50',
        title: t('compare.cost_variance') || 'Cost Variance Analysis',
        text: t('compare.insight_variance', { 
          spread: formatCurrency(spread),
          pct: spreadPct
        }) || `Cost per bird varies by ${formatCurrency(spread)} (${spreadPct}% range) across all flocks`
      });
    }

    // Age normalization insight
    const ageSpread = Math.max(...selectedMetrics.map(m => m.ageWeeks)) - Math.min(...selectedMetrics.map(m => m.ageWeeks));
    if (ageSpread > 2) {
      const oldest = selectedMetrics.reduce((max, m) => m.ageWeeks > max.ageWeeks ? m : max);
      const youngest = selectedMetrics.reduce((min, m) => m.ageWeeks < min.ageWeeks ? m : min);

      results.push({
        icon: TrendingUp,
        color: 'text-purple-600 bg-purple-50',
        title: t('compare.age_normalization') || 'Age Difference Notice',
        text: t('compare.insight_age', {
          oldest: oldest.flock.name,
          oldestAge: oldest.ageWeeks,
          youngest: youngest.flock.name,
          youngestAge: youngest.ageWeeks
        }) || `Note: ${oldest.flock.name} is ${oldest.ageWeeks - youngest.ageWeeks} weeks older than ${youngest.flock.name}. Consider age when comparing costs.`
      });
    }

    // Performance ranking
    if (selectedMetrics.length >= 3) {
      const ranked = [...selectedMetrics]
        .map(m => ({
          ...m,
          score: (1 / (m.costPerBird + 1)) * 100 + m.survivalRate * 2 // Combined efficiency score
        }))
        .sort((a, b) => b.score - a.score);

      if (ranked[0]) {
        results.push({
          icon: Target,
          color: 'text-emerald-600 bg-emerald-50',
          title: t('compare.overall_leader') || 'Overall Best Performer',
          text: t('compare.insight_leader', {
            flock: ranked[0].flock.name,
            rank: '1st',
            total: selectedMetrics.length
          }) || `${ranked[0].flock.name} ranks #1 overall (${ranked[0].flock.name} out of ${selectedMetrics.length} flocks)`
        });
      }
    }

    // Average vs best comparison
    if (statistics && statistics.bestCostPerBird) {
      const best = statistics.bestCostPerBird;
      const potentialSavings = (statistics.avgCostPerBird - best.costPerBird) * statistics.avgTotalExpenses / statistics.avgCostPerBird;

      if (potentialSavings > 0 && selectedMetrics.length >= 3) {
        results.push({
          icon: Lightbulb,
          color: 'text-green-600 bg-green-50',
          title: t('compare.potential_savings') || 'Potential Cost Savings',
          text: t('compare.insight_savings', {
            savings: formatCurrency(potentialSavings),
            flock: best.flock.name
          }) || `Applying ${best.flock.name}'s efficiency to all flocks could save ~${formatCurrency(potentialSavings)}`
        });
      }
    }

    return results;
  }, [selectedMetrics, statistics, t]);

  const exportToCSV = () => {
    if (selectedMetrics.length === 0) return;

    const dateStr = new Date().toISOString().split('T')[0];
    const flockNames = selectedMetrics.map(m => m.flock.name.replace(/[^a-zA-Z0-9]/g, '_')).join('_vs_');

    let csv = 'Multi-Flock Comparison Report\n';
    csv += `Generated: ${new Date().toLocaleString()}\n`;
    csv += `Comparing ${selectedMetrics.length} flocks\n\n`;

    csv += 'COMPARISON SUMMARY\n';
    csv += `Metric,${selectedMetrics.map(m => m.flock.name).join(',')},Average,Best,Worst\n`;

    const metrics = [
      { label: 'Type', values: selectedMetrics.map(m => m.flock.type) },
      { label: 'Start Date', values: selectedMetrics.map(m => formatDate(m.flock.arrival_date || m.flock.start_date)) },
      { label: 'Current Age (weeks)', values: selectedMetrics.map(m => m.ageWeeks.toString()), 
        avg: (statistics?.avgCostPerWeek ? selectedMetrics.reduce((sum, m) => sum + m.ageWeeks, 0) / selectedMetrics.length : 0).toFixed(1) },
      { label: 'Initial Count', values: selectedMetrics.map(m => m.flock.initial_count.toString()) },
      { label: 'Current Count', values: selectedMetrics.map(m => m.flock.current_count.toString()) },
      { label: 'Mortality', values: selectedMetrics.map(m => `${m.totalMortality} (${m.mortalityRate.toFixed(1)}%)`) },
      { label: `Total Expenses (${currencyCode})`, values: selectedMetrics.map(m => m.totalExpenses.toString()),
        avg: statistics?.avgTotalExpenses.toFixed(2) || '0' },
      { label: `Cost per Bird (${currencyCode})`, values: selectedMetrics.map(m => Math.round(m.costPerBird).toString()),
        avg: statistics?.avgCostPerBird.toFixed(2) || '0',
        best: statistics?.bestCostPerBird ? Math.round(statistics.bestCostPerBird.costPerBird).toString() : '',
        worst: statistics?.worstCostPerBird ? Math.round(statistics.worstCostPerBird.costPerBird).toString() : '' },
      { label: `Avg Cost/Week (${currencyCode})`, values: selectedMetrics.map(m => Math.round(m.avgCostPerWeek).toString()),
        avg: statistics?.avgCostPerWeek.toFixed(2) || '0' },
      { label: 'Survival Rate (%)', values: selectedMetrics.map(m => m.survivalRate.toFixed(1)),
        avg: statistics?.avgSurvivalRate.toFixed(1) || '0',
        best: statistics?.bestSurvival ? statistics.bestSurvival.survivalRate.toFixed(1) : '',
        worst: statistics?.worstSurvival ? statistics.worstSurvival.survivalRate.toFixed(1) : '' }
    ];

    metrics.forEach(metric => {
      csv += `${metric.label},${metric.values.join(',')},${metric.avg || '-'},${metric.best || '-'},${metric.worst || '-'}\n`;
    });

    if (weeklyComparison.length > 0) {
      csv += '\nWEEKLY EXPENSE BREAKDOWN\n';
      csv += `Week,${selectedMetrics.map(m => m.flock.name).join(',')},Minimum,Maximum\n`;
      weeklyComparison.forEach(w => {
        csv += `Week ${w.week},${w.costs.join(',')},${w.minCost},${w.maxCost}\n`;
      });
    }

    csv += '\nSTATISTICAL SUMMARY\n';
    if (statistics) {
      csv += `Average Cost per Bird,${formatCurrency(statistics.avgCostPerBird)}\n`;
      csv += `Best Cost per Bird,${statistics.bestCostPerBird ? formatCurrency(statistics.bestCostPerBird.costPerBird) : '-'} (${statistics.bestCostPerBird?.flock.name || '-'})\n`;
      csv += `Worst Cost per Bird,${statistics.worstCostPerBird ? formatCurrency(statistics.worstCostPerBird.costPerBird) : '-'} (${statistics.worstCostPerBird?.flock.name || '-'})\n`;
      csv += `Average Survival Rate,${statistics.avgSurvivalRate.toFixed(1)}%\n`;
    }

    csv += '\nINSIGHTS\n';
    insights.forEach(insight => {
      csv += `${insight.title}: ${insight.text}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flock_comparison_${flockNames}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleDropdown = (index: number) => {
    setOpenDropdowns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.clear();
        newSet.add(index);
      }
      return newSet;
    });
  };

  const FlockSelector = ({
    index,
    value,
    onChange,
    onRemove,
    canRemove
  }: {
    index: number;
    value: string;
    onChange: (id: string) => void;
    onRemove: () => void;
    canRemove: boolean;
  }) => {
    const selectedFlock = flocks.find(f => f.id === value);
    const isOpen = openDropdowns.has(index);
    const availableFlocks = flocks.filter(f => !selectedFlockIds.includes(f.id) || f.id === value);

    return (
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            {index === 0 
              ? (t('compare.select_first_batch') || 'Select First Batch')
              : index === 1 
              ? (t('compare.select_second_batch') || 'Select Second Batch')
              : `${t('compare.select_batch') || 'Select Batch'} ${index + 1}`}
          </label>
          {canRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
              title={t('compare.remove_batch') || 'Remove batch'}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => toggleDropdown(index)}
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-left flex items-center justify-between hover:border-gray-300 transition-colors text-gray-900"
        >
          <span className={selectedFlock ? 'text-gray-900' : 'text-gray-400'}>
            {selectedFlock ? selectedFlock.name : t('compare.select_batch_placeholder') || 'Select a batch...'}
          </span>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 max-h-64 overflow-y-auto">
            {availableFlocks.length === 0 ? (
              <div className="px-4 py-3 text-gray-500 text-sm">{t('compare.no_batches_available') || 'No batches available'}</div>
            ) : (
              availableFlocks.map(flock => (
                <button
                  key={flock.id}
                  type="button"
                  onClick={() => {
                    onChange(flock.id);
                    setOpenDropdowns(new Set());
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div>
                    <div className="font-medium text-gray-900">{flock.name}</div>
                    <div className="text-sm text-gray-500">
                      {flock.type} - {flock.current_count} {t('common.birds') || 'birds'}
                    </div>
                  </div>
                  {value === flock.id && <Check className="w-5 h-5 text-green-600" />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin" />
      </div>
    );
  }

  if (flocks.length < 2) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate('dashboard')}
            className="p-2 hover:bg-white rounded-xl transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">{t('compare.title') || 'Compare Batches'}</h2>
            <p className="text-gray-500 mt-1">{t('compare.subtitle') || 'Analyze cost and performance across different batches'}</p>
          </div>
        </div>

        <div className="section-card text-center py-12">
          <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('compare.not_enough_batches') || 'Not Enough Batches'}</h3>
          <p className="text-gray-500 mb-6">
            {t('compare.need_at_least_2') || 'You need at least 2 batches to use the comparison feature.'}
            {flocks.length === 1 && ` ${t('compare.currently_have_one') || 'You currently have 1 batch.'}`}
            {flocks.length === 0 && ` ${t('compare.create_first_batch') || 'Create your first batch to get started.'}`}
          </p>
          <button
            onClick={() => onNavigate('flocks')}
            className="btn-primary"
          >
            {t('compare.go_to_flocks') || 'Go to Flocks'}
          </button>
        </div>
      </div>
    );
  }

  const hasSelectedFlocks = selectedFlockIds.length > 0;
  const canAddMore = selectedFlockIds.length < flocks.length;

  return (
    <div className="space-y-6 animate-fade-in" onClick={() => setOpenDropdowns(new Set())}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => onNavigate('dashboard')}
            className="p-2 hover:bg-white rounded-xl transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('compare.title') || 'Compare Batches'}</h2>
            <p className="text-gray-500 mt-1">{t('compare.subtitle') || 'Analyze cost and performance across different batches'}</p>
          </div>
        </div>

        {hasSelectedFlocks && selectedMetrics.length > 0 && (
          <button
            onClick={exportToCSV}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            <span className="hidden sm:inline">{t('compare.export_comparison') || 'Export Comparison'}</span>
          </button>
        )}
      </div>

      <div className="section-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('compare.select_flocks_to_compare') || 'Select Flocks to Compare'}</h3>
          {canAddMore && (
            <button
              onClick={addFlock}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('compare.add_flock') || 'Add Flock'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selectedFlockIds.map((flockId, index) => (
            <FlockSelector
              key={index}
              index={index}
              value={flockId}
              onChange={(id) => updateFlockSelection(index, id)}
              onRemove={() => removeFlock(index)}
              canRemove={selectedFlockIds.length > 2}
            />
          ))}
        </div>
      </div>

      {loadingMetrics && selectedMetrics.length < selectedFlockIds.length ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin" />
        </div>
      ) : selectedMetrics.length >= 2 ? (
        <>
          {/* Statistical Summary */}
          {statistics && (
            <div className="section-card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">{t('compare.statistical_summary') || 'Statistical Summary'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">{t('compare.avg_cost_per_bird') || 'Avg Cost/Bird'}</div>
                  <div className="text-xl font-bold text-gray-900">{formatCurrency(statistics.avgCostPerBird)}</div>
                </div>
                <div className="p-4 bg-green-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">{t('compare.best_cost') || 'Best Cost'}</div>
                  <div className="text-xl font-bold text-gray-900">
                    {statistics.bestCostPerBird ? formatCurrency(statistics.bestCostPerBird.costPerBird) : '-'}
                  </div>
                  {statistics.bestCostPerBird && (
                    <div className="text-xs text-gray-600 mt-1">{statistics.bestCostPerBird.flock.name}</div>
                  )}
                </div>
                <div className="p-4 bg-red-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">{t('compare.worst_cost') || 'Worst Cost'}</div>
                  <div className="text-xl font-bold text-gray-900">
                    {statistics.worstCostPerBird ? formatCurrency(statistics.worstCostPerBird.costPerBird) : '-'}
                  </div>
                  {statistics.worstCostPerBird && (
                    <div className="text-xs text-gray-600 mt-1">{statistics.worstCostPerBird.flock.name}</div>
                  )}
                </div>
                <div className="p-4 bg-purple-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-1">{t('compare.avg_survival') || 'Avg Survival'}</div>
                  <div className="text-xl font-bold text-gray-900">{statistics.avgSurvivalRate.toFixed(1)}%</div>
                </div>
              </div>
            </div>
          )}

          {/* Comparison Table */}
          <div className="section-card overflow-hidden">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{t('compare.comparison_summary') || 'Comparison Summary'}</h3>
            <div className="overflow-x-auto mx-0 sm:-mx-6">
              <table className="w-full md:min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-2 sm:px-6 py-3 text-left text-sm font-semibold text-gray-700 sticky left-0 bg-white z-10">{t('compare.metric') || 'Metric'}</th>
                    {selectedMetrics.map((metrics, idx) => (
                      <th key={idx} className="px-2 sm:px-6 py-3 text-center text-sm font-semibold text-gray-700 min-w-[120px] sm:min-w-[150px]">
                        {metrics.flock.name}
                      </th>
                    ))}
                    <th className="px-2 sm:px-6 py-3 text-center text-sm font-semibold text-gray-700 bg-gray-50">{t('compare.average') || 'Average'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-2 sm:px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.type') || 'Type'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-2 sm:px-6 py-3 text-sm text-center font-medium text-gray-900">{metrics.flock.type}</td>
                    ))}
                    <td className="px-2 sm:px-6 py-3 text-sm text-center text-gray-500 bg-gray-50">-</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.start_date') || 'Start Date'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-6 py-3 text-sm text-center font-medium text-gray-900">
                        {formatDate(metrics.flock.arrival_date || metrics.flock.start_date)}
                      </td>
                    ))}
                    <td className="px-6 py-3 text-sm text-center text-gray-500 bg-gray-50">-</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.current_age') || 'Current Age'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-6 py-3 text-sm text-center font-medium text-gray-900">
                        {metrics.ageWeeks} {t('common.weeks') || 'weeks'}
                      </td>
                    ))}
                    <td className="px-6 py-3 text-sm text-center font-medium text-gray-700 bg-gray-50">
                      {statistics ? `${(selectedMetrics.reduce((sum, m) => sum + m.ageWeeks, 0) / selectedMetrics.length).toFixed(1)} ${t('common.weeks') || 'weeks'}` : '-'}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.initial_count') || 'Initial Count'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-6 py-3 text-sm text-center font-medium text-gray-900">{metrics.flock.initial_count.toLocaleString()}</td>
                    ))}
                    <td className="px-6 py-3 text-sm text-center text-gray-500 bg-gray-50">-</td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.current_count') || 'Current Count'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-6 py-3 text-sm text-center font-medium text-gray-900">{metrics.flock.current_count.toLocaleString()}</td>
                    ))}
                    <td className="px-6 py-3 text-sm text-center font-medium text-gray-700 bg-gray-50">
                      {selectedMetrics.reduce((sum, m) => sum + m.flock.current_count, 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.mortality') || 'Mortality'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-6 py-3 text-sm text-center font-medium text-gray-900">
                        {metrics.totalMortality} ({metrics.mortalityRate.toFixed(1)}%)
                      </td>
                    ))}
                    <td className="px-6 py-3 text-sm text-center font-medium text-gray-700 bg-gray-50">
                      {statistics ? `${statistics.avgMortalityRate.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 bg-gray-50/30">
                    <td className="px-6 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">{t('compare.total_expenses') || 'Total Expenses'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-6 py-3 text-sm text-center font-bold text-gray-900">{formatCurrency(metrics.totalExpenses)}</td>
                    ))}
                    <td className="px-6 py-3 text-sm text-center font-bold text-gray-700 bg-gray-50">
                      {statistics ? formatCurrency(statistics.avgTotalExpenses) : '-'}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50/50 bg-gray-50/30">
                    <td className="px-6 py-3 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">{t('compare.cost_per_bird') || 'Cost per Bird'}</td>
                    {selectedMetrics.map((metrics, idx) => {
                      const isBest = statistics?.bestCostPerBird?.flock.id === metrics.flock.id;
                      const isWorst = statistics?.worstCostPerBird?.flock.id === metrics.flock.id;
                      return (
                        <td 
                          key={idx} 
                          className={`px-6 py-3 text-sm text-center font-bold ${
                            isBest ? 'text-green-600' : isWorst ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrency(Math.round(metrics.costPerBird))}
                        </td>
                      );
                    })}
                    <td className="px-6 py-3 text-sm text-center font-bold text-gray-700 bg-gray-50">
                      {statistics ? formatCurrency(statistics.avgCostPerBird) : '-'}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.avg_cost_week') || 'Avg Cost/Week'}</td>
                    {selectedMetrics.map((metrics, idx) => (
                      <td key={idx} className="px-6 py-3 text-sm text-center font-medium text-gray-900">{formatCurrency(Math.round(metrics.avgCostPerWeek))}</td>
                    ))}
                    <td className="px-6 py-3 text-sm text-center font-medium text-gray-700 bg-gray-50">
                      {statistics ? formatCurrency(statistics.avgCostPerWeek) : '-'}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{t('compare.survival_rate') || 'Survival Rate'}</td>
                    {selectedMetrics.map((metrics, idx) => {
                      const isBest = statistics?.bestSurvival?.flock.id === metrics.flock.id;
                      const isWorst = statistics?.worstSurvival?.flock.id === metrics.flock.id;
                      return (
                        <td 
                          key={idx} 
                          className={`px-6 py-3 text-sm text-center font-medium ${
                            isBest ? 'text-green-600' : isWorst ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {metrics.survivalRate.toFixed(1)}%
                        </td>
                      );
                    })}
                    <td className="px-6 py-3 text-sm text-center font-medium text-gray-700 bg-gray-50">
                      {statistics ? `${statistics.avgSurvivalRate.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Week-by-Week Comparison */}
          {weeklyComparison.length > 0 && (
            <div className="section-card overflow-hidden">
              <h3 className="text-lg font-bold text-gray-900 mb-4">{t('compare.week_by_week') || 'Week-by-Week Cost Comparison'}</h3>
            <div className="overflow-x-auto mx-0 sm:-mx-6">
                <table className="w-full sm:min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('compare.week') || 'Week'}</th>
                      {selectedMetrics.map((metrics, idx) => (
                        <th key={idx} className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
                          {metrics.flock.name}
                        </th>
                      ))}
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 bg-gray-50">{t('compare.minimum') || 'Min'}</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700 bg-gray-50">{t('compare.maximum') || 'Max'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {weeklyComparison.map((w) => (
                      <tr key={w.week} className="hover:bg-gray-50/50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{t('compare.week_label', { week: w.week }) || `Week ${w.week}`}</td>
                        {w.costs.map((cost, idx) => {
                          const isWinner = w.winners.includes(idx);
                          return (
                            <td 
                              key={idx} 
                              className={`px-6 py-3 text-sm text-right ${
                                isWinner ? 'font-bold text-green-600' : 'text-gray-900'
                              }`}
                            >
                              {cost > 0 ? formatCurrency(cost) : '-'}
                              {isWinner && <Trophy className="w-3 h-3 inline-block ml-1" />}
                            </td>
                          );
                        })}
                        <td className="px-6 py-3 text-sm text-right font-medium text-green-600 bg-gray-50">{formatCurrency(w.minCost)}</td>
                        <td className="px-6 py-3 text-sm text-right font-medium text-red-600 bg-gray-50">{formatCurrency(w.maxCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Key Insights */}
          {insights.length > 0 && (
            <div className="section-card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">{t('compare.key_insights') || 'Key Insights'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((insight, idx) => {
                  const Icon = insight.icon;
                  return (
                    <div key={idx} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                      <div className={`p-2 rounded-lg ${insight.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{insight.title}</div>
                        <div className="text-sm text-gray-600 mt-0.5">{insight.text}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : selectedMetrics.length === 1 ? (
        <div className="section-card text-center py-8">
          <p className="text-gray-500">{t('compare.select_at_least_two') || 'Select at least 2 flocks to compare'}</p>
        </div>
      ) : (
        <div className="section-card text-center py-8">
          <p className="text-gray-500">{t('compare.select_two_batches') || 'Select batches to compare'}</p>
        </div>
      )}
    </div>
  );
}
