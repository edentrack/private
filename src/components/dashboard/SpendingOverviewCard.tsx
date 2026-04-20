import { useEffect, useState } from 'react';
import { Calendar, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';

export type SpendingRange = 'daily' | 'weekly' | 'biweekly' | 'monthly';

interface SpendingOverviewCardProps {
  range: SpendingRange;
  onRangeChange: (range: SpendingRange) => void;
  flockId: string | null;
}

export function SpendingOverviewCard({ range, onRangeChange, flockId }: SpendingOverviewCardProps) {
  const { profile, currentFarm, currentRole } = useAuth();
  const [spending, setSpending] = useState(0);
  const [loading, setLoading] = useState(true);
  const hideFinancials = shouldHideFinancialData(currentRole);

  useEffect(() => {
    if (currentFarm) {
      loadSpending();
    }
  }, [currentFarm, range, flockId]);

  const getDateRange = (range: SpendingRange): Date => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    switch (range) {
      case 'daily':
        return now;
      case 'weekly':
        const weekly = new Date(now);
        weekly.setDate(weekly.getDate() - 7);
        return weekly;
      case 'biweekly':
        const biweekly = new Date(now);
        biweekly.setDate(biweekly.getDate() - 14);
        return biweekly;
      case 'monthly':
        const monthly = new Date(now);
        monthly.setDate(monthly.getDate() - 30);
        return monthly;
      default:
        return now;
    }
  };

  const getRangeLabel = (range: SpendingRange): string => {
    switch (range) {
      case 'daily':
        return 'Today';
      case 'weekly':
        return 'Last 7 days';
      case 'biweekly':
        return 'Last 14 days';
      case 'monthly':
        return 'Last 30 days';
      default:
        return '';
    }
  };

  const loadSpending = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const startDate = getDateRange(range);

      let query = supabase
        .from('expenses')
        .select('amount')
        .eq('farm_id', currentFarm.id)
        .gte('date', startDate.toISOString().split('T')[0]);

      if (flockId) {
        query = query.eq('flock_id', flockId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const total = (data || []).reduce((sum, exp) => sum + exp.amount, 0);
      setSpending(total);
    } catch (error) {
      console.error('Error loading spending:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section-card animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="stat-label mb-1">Spending</div>
          <div className="text-sm text-gray-600">{getRangeLabel(range)}</div>
        </div>
        <div className="icon-circle-green">
          <TrendingUp className="w-5 h-5" />
        </div>
      </div>

      <div className="text-3xl font-bold text-gray-900 mb-4">
        {loading ? (
          <span className="text-gray-400">Loading...</span>
        ) : hideFinancials ? (
          <span className="text-gray-400 italic">Hidden</span>
        ) : (
          formatCurrency(spending, profile?.currency_preference || 'USD')
        )}
      </div>

      {flockId && (
        <div className="text-xs text-gray-500 mb-4">
          Filtered to selected flock only
        </div>
      )}

      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => onRangeChange('daily')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            range === 'daily'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => onRangeChange('weekly')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            range === 'weekly'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Week
        </button>
        <button
          onClick={() => onRangeChange('biweekly')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            range === 'biweekly'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          2 Weeks
        </button>
        <button
          onClick={() => onRangeChange('monthly')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            range === 'monthly'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Month
        </button>
      </div>
    </div>
  );
}
