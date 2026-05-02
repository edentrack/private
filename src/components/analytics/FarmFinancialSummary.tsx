import { useEffect, useState } from 'react';
import { Building2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface FarmFinancialData {
  totalExpenses: number;
  totalRevenue: number;
  totalProfit: number;
  flockCount: number;
}

export function FarmFinancialSummary({ compact = false, farm }: { compact?: boolean; farm?: any } = {}) {
  const { profile, currentFarm } = useAuth();
  const targetFarm = farm || currentFarm;
  const [financials, setFinancials] = useState<FarmFinancialData>({
    totalExpenses: 0,
    totalRevenue: 0,
    totalProfit: 0,
    flockCount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (targetFarm) {
      loadFarmFinancials();
    }
  }, [targetFarm]);

  const loadFarmFinancials = async () => {
    if (!targetFarm?.id) return;

    setLoading(true);
    try {
      const [
        { data: expenses },
        { data: eggSales },
        { data: birdSales },
        { data: flocks },
      ] = await Promise.all([
        supabase.from('expenses').select('amount').eq('farm_id', targetFarm.id),
        supabase.from('egg_sales').select('total_amount').eq('farm_id', targetFarm.id),
        supabase.from('bird_sales').select('total_amount').eq('farm_id', targetFarm.id),
        supabase.from('flocks').select('id').eq('farm_id', targetFarm.id).eq('status', 'active'),
      ]);

      const totalExpenses = expenses?.reduce((sum, exp) => sum + (exp.amount || 0), 0) || 0;
      const totalRevenue =
        (eggSales?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0) +
        (birdSales?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0);
      const totalProfit = totalRevenue - totalExpenses;

      setFinancials({
        totalExpenses,
        totalRevenue,
        totalProfit,
        flockCount: flocks?.length || 0
      });
    } catch (error) {
      console.error('Error loading farm financials:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="icon-circle-yellow">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Farm Financial Summary</h3>
        </div>
        <div className="text-center py-8 text-gray-500">Loading...</div>
      </div>
    );
  }

  const profitMargin = financials.totalRevenue > 0
    ? ((financials.totalProfit / financials.totalRevenue) * 100)
    : 0;

  return (
    <div className="bg-gradient-to-br from-neon-400 to-neon-500 rounded-3xl p-6 text-gray-900">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gray-900/20 rounded-xl">
          <Building2 className="w-6 h-6 text-gray-900" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Farm Financial Summary</h3>
          <p className="text-sm text-gray-800">{profile?.farm_name}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-900/10 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">Total Expenses</span>
            <TrendingDown className="w-5 h-5 text-gray-700" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {financials.totalExpenses.toLocaleString()}
          </div>
          <div className="text-xs text-gray-700 mt-1">
            {profile?.currency_preference || 'XAF'}
          </div>
        </div>

        <div className="bg-gray-900/10 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900">Total Revenue</span>
            <TrendingUp className="w-5 h-5 text-gray-700" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {financials.totalRevenue.toLocaleString()}
          </div>
          <div className="text-xs text-gray-700 mt-1">
            {profile?.currency_preference || 'XAF'}
          </div>
        </div>
      </div>

      <div className="bg-gray-900/20 backdrop-blur-sm rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-900">Net Farm Profit</span>
          <DollarSign className="w-5 h-5 text-gray-700" />
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-4xl font-bold text-gray-900">
            {financials.totalProfit >= 0 ? '+' : ''}{financials.totalProfit.toLocaleString()}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {profitMargin.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-700">margin</div>
          </div>
        </div>
        <div className="text-xs text-gray-700 mt-1">
          {profile?.currency_preference || 'XAF'}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="bg-gray-900/10 backdrop-blur-sm rounded-xl p-3">
          <div className="text-xs text-gray-700 mb-1">Active Flocks</div>
          <div className="text-2xl font-bold text-gray-900">{financials.flockCount}</div>
        </div>
        <div className="bg-gray-900/10 backdrop-blur-sm rounded-xl p-3">
          <div className="text-xs text-gray-700 mb-1">Avg per Flock</div>
          <div className="text-2xl font-bold text-gray-900">
            {financials.flockCount > 0
              ? Math.round(financials.totalProfit / financials.flockCount).toLocaleString()
              : '0'}
          </div>
        </div>
      </div>
    </div>
  );
}
