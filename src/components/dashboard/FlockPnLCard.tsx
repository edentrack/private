import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock, FlockCycleStatus } from '../../types/database';

interface FlockPnLCardProps {
  flock: Flock | null;
  onNavigate?: (view: string) => void;
  compact?: boolean;
}

interface PnLData {
  revenue: number;
  feedCost: number;
  directExpenses: number;
  unallocatedCosts: number;
  totalCosts: number;
  netProfit: number;
  perBirdROI: number;
  marginPercent: number;
  hasRevenue: boolean;
}

interface CycleData {
  currentWeek: number | null;
  targetWeeks: number | null;
  weeksRemaining: number | null;
}

export function FlockPnLCard({ flock, onNavigate, compact = false }: FlockPnLCardProps) {
  const { profile, currentFarm } = useAuth();
  const [pnl, setPnl] = useState<PnLData>({
    revenue: 0,
    feedCost: 0,
    directExpenses: 0,
    unallocatedCosts: 0,
    totalCosts: 0,
    netProfit: 0,
    perBirdROI: 0,
    marginPercent: 0,
    hasRevenue: false
  });
  const [cycle, setCycle] = useState<CycleData>({
    currentWeek: null,
    targetWeeks: null,
    weeksRemaining: null
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (flock) {
      loadPnLData();
    } else {
      setPnl({
        revenue: 0,
        feedCost: 0,
        directExpenses: 0,
        unallocatedCosts: 0,
        totalCosts: 0,
        netProfit: 0,
        perBirdROI: 0,
        marginPercent: 0,
        hasRevenue: false
      });
      setCycle({ currentWeek: null, targetWeeks: null, weeksRemaining: null });
      setLoading(false);
    }
  }, [flock]);

  const loadPnLData = async () => {
    if (!flock || !currentFarm?.id) return;

    setLoading(true);
    try {
      // Load cycle status
      const cycleRes = await supabase.rpc('get_flock_cycle_status', { p_flock_id: flock.id });
      let cycleData: CycleData = { currentWeek: null, targetWeeks: null, weeksRemaining: null };

      if (cycleRes.data && cycleRes.data.length > 0) {
        const cycleStatus = cycleRes.data[0] as FlockCycleStatus;
        cycleData = {
          currentWeek: cycleStatus.current_week,
          targetWeeks: cycleStatus.target_weeks,
          weeksRemaining: cycleStatus.weeks_remaining_to_target
        };
      }
      setCycle(cycleData);

      // Load revenues (bird sales + egg sales)
      const [revenuRes, eggSalesRes] = await Promise.all([
        supabase.from('revenues').select('amount').eq('flock_id', flock.id),
        supabase.from('egg_sales').select('total_amount').eq('flock_id', flock.id)
      ]);

      const birdRevenue = revenuRes.data?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
      const eggRevenue = eggSalesRes.data?.reduce((sum, e) => sum + (e.total_amount || 0), 0) || 0;
      const totalRevenue = birdRevenue + eggRevenue;

      // Load expenses for this flock
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, category, flock_id')
        .eq('flock_id', flock.id);

      // Separate feed expenses from other direct expenses
      let feedCost = 0;
      let directExpenses = 0;

      (expenses || []).forEach(exp => {
        if (exp.category === 'feed') {
          feedCost += exp.amount || 0;
        } else {
          directExpenses += exp.amount || 0;
        }
      });

      // Load unallocated (farm-level) expenses
      // These are expenses with NO flock_id that should be visible in PnL context
      const { data: unallocatedExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('farm_id', currentFarm.id)
        .is('flock_id', null);

      const unallocatedCosts = (unallocatedExpenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);

      const totalCosts = feedCost + directExpenses;
      const netProfit = totalRevenue - totalCosts;
      const perBirdROI = flock.initial_count > 0 ? netProfit / flock.initial_count : 0;
      const marginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      setPnl({
        revenue: totalRevenue,
        feedCost,
        directExpenses,
        unallocatedCosts,
        totalCosts,
        netProfit,
        perBirdROI,
        marginPercent,
        hasRevenue: totalRevenue > 0
      });
    } catch (error) {
      console.error('Error loading P&L data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, showDash = false): string => {
    if (showDash && value === 0) return '—';
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const currency = profile?.currency_preference || currentFarm?.currency_code || 'CFA';

  if (!flock) {
    return (
      <div className={`bg-white ${compact ? 'rounded-xl p-4' : 'rounded-2xl p-6'} border border-gray-200`}>
        <div className="text-center py-8 text-gray-500">
          <DollarSign className="w-10 h-10 mx-auto mb-2 text-gray-400" />
          <p className="font-medium">Select a flock to view P&L</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`bg-white ${compact ? 'rounded-xl p-4' : 'rounded-2xl p-6'} border border-gray-200`}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const cycleLabel = cycle.currentWeek && cycle.targetWeeks
    ? `Week ${cycle.currentWeek} of ${cycle.targetWeeks}`
    : cycle.currentWeek
      ? `Week ${cycle.currentWeek}`
      : 'No cycle';

  return (
    <div className={`bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow animate-fade-in-up ${compact ? 'rounded-xl p-4' : 'rounded-2xl p-6'}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className={`${compact ? 'text-base' : 'text-lg'} font-bold text-gray-900`}>
              {flock.name}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{cycleLabel}</p>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('flocks')}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <AlertCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Revenue Section */}
      <div className={`p-3 bg-neon-50 rounded-lg ${compact ? 'mb-3' : 'mb-4'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-neon-900">Revenue</span>
          <TrendingUp className="w-4 h-4 text-neon-700" />
        </div>
        <div className="mt-1 text-lg font-bold text-neon-900">
          {pnl.revenue > 0 ? formatCurrency(pnl.revenue) : '—'}
        </div>
        <div className="text-xs text-neon-700 mt-0.5">{currency}</div>
      </div>

      {/* Costs Breakdown */}
      <div className={`space-y-2 ${compact ? 'mb-3' : 'mb-4'}`}>
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Costs</div>

        {/* Feed Cost */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700">Feed</span>
          <span className="font-medium text-gray-900">
            {pnl.feedCost > 0 ? formatCurrency(pnl.feedCost) : '—'}
          </span>
        </div>

        {/* Direct Expenses */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700">Direct Expenses</span>
          <span className="font-medium text-gray-900">
            {pnl.directExpenses > 0 ? formatCurrency(pnl.directExpenses) : (pnl.totalCosts === 0 ? 'Costs being tracked' : '—')}
          </span>
        </div>

        {/* Unallocated (farm-level) costs - only show if > 0 */}
        {pnl.unallocatedCosts > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">Farm-level Costs</span>
            <span className="font-medium text-gray-900 text-xs">
              {formatCurrency(pnl.unallocatedCosts)}
            </span>
          </div>
        )}

        {/* Total Costs */}
        <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-sm font-semibold">
          <span className="text-gray-900">Total Costs</span>
          <span className="text-gray-900">
            {pnl.totalCosts > 0 ? formatCurrency(pnl.totalCosts) : '—'}
          </span>
        </div>
      </div>

      {/* Net P&L */}
      <div className={`p-3 rounded-lg ${
        pnl.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'
      } ${compact ? 'mb-3' : 'mb-4'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${pnl.netProfit >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
            Net Profit/Loss
          </span>
          {pnl.netProfit >= 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-700" />
          )}
        </div>
        <div className={`mt-1 text-xl font-bold ${pnl.netProfit >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
          {pnl.netProfit >= 0 ? '+' : ''}{formatCurrency(pnl.netProfit)}
        </div>
        <div className={`text-xs mt-0.5 ${pnl.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {currency}
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-2 text-sm">
        {/* Per-bird ROI */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Per-bird ROI</span>
          <span className="font-semibold text-gray-900">
            {flock.initial_count > 0 ? formatCurrency(pnl.perBirdROI) : '—'}
          </span>
        </div>

        {/* Margin % */}
        {pnl.hasRevenue && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Margin</span>
            <span className={`font-semibold ${pnl.marginPercent >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {pnl.marginPercent >= 0 ? '+' : ''}{pnl.marginPercent.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Note about allocation */}
      {pnl.unallocatedCosts > 0 && (
        <div className="mt-4 p-2 bg-amber-50 rounded text-xs text-amber-800 border border-amber-200">
          <p>
            <strong>Note:</strong> Farm-level costs are shown for context but not deducted from this flock's P&L.
          </p>
        </div>
      )}
    </div>
  );
}
