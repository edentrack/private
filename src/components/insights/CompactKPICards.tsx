import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface KPIData {
  totalExpenses: number;
  totalRevenue: number;
  totalProfit: number;
  flockCount: number;
}

export function CompactKPICards({ farmId }: { farmId?: string }) {
  const { profile, currentFarm } = useAuth();
  const targetFarmId = farmId || currentFarm?.id;
  const [kpis, setKpis] = useState<KPIData>({
    totalExpenses: 0,
    totalRevenue: 0,
    totalProfit: 0,
    flockCount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (targetFarmId) {
      loadKPIs();
    }
  }, [targetFarmId]);

  const loadKPIs = async () => {
    if (!targetFarmId) return;

    setLoading(true);
    try {
      const [expensesRes, revenuesRes, flocksRes] = await Promise.all([
        supabase.from('expenses').select('amount').eq('farm_id', targetFarmId),
        supabase.from('revenues').select('amount').eq('farm_id', targetFarmId),
        supabase.from('flocks').select('id').eq('farm_id', targetFarmId).eq('status', 'active')
      ]);

      const totalExpenses = expensesRes.data?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
      const totalRevenue = revenuesRes.data?.reduce((sum, rev) => sum + rev.amount, 0) || 0;
      const totalProfit = totalRevenue - totalExpenses;

      setKpis({
        totalExpenses,
        totalRevenue,
        totalProfit,
        flockCount: flocksRes.data?.length || 0
      });
    } catch (error) {
      console.error('Error loading KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 h-24 border border-gray-100" />
        ))}
      </div>
    );
  }

  const profitMargin = kpis.totalRevenue > 0
    ? ((kpis.totalProfit / kpis.totalRevenue) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-xl p-4 border border-red-100 hover:border-red-200 transition-all duration-200 animate-slide-up" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Expenses</span>
          <div className="p-1.5 bg-red-50 rounded-lg">
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {kpis.totalExpenses.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {profile?.currency_preference || 'XAF'}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-green-100 hover:border-green-200 transition-all duration-200 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Revenue</span>
          <div className="p-1.5 bg-green-50 rounded-lg">
            <TrendingUp className="w-4 h-4 text-green-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {kpis.totalRevenue.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {profile?.currency_preference || 'XAF'}
        </div>
      </div>

      <div className={`bg-white rounded-xl p-4 border transition-all duration-200 animate-slide-up ${
        kpis.totalProfit >= 0
          ? 'border-neon-200 hover:border-neon-300'
          : 'border-orange-100 hover:border-orange-200'
      }`} style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Net Profit</span>
          <div className={`p-1.5 rounded-lg ${
            kpis.totalProfit >= 0 ? 'bg-neon-50' : 'bg-orange-50'
          }`}>
            <DollarSign className={`w-4 h-4 ${
              kpis.totalProfit >= 0 ? 'text-neon-600' : 'text-orange-600'
            }`} />
          </div>
        </div>
        <div className={`text-2xl font-bold ${
          kpis.totalProfit >= 0 ? 'text-gray-900' : 'text-orange-900'
        }`}>
          {kpis.totalProfit >= 0 ? '+' : ''}{kpis.totalProfit.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {profitMargin.toFixed(1)}% margin
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100 hover:border-gray-200 transition-all duration-200 animate-slide-up" style={{ animationDelay: '300ms' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Active Flocks</span>
          <div className="p-1.5 bg-gray-50 rounded-lg">
            <Users className="w-4 h-4 text-gray-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {kpis.flockCount}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {kpis.flockCount > 0
            ? `${Math.round(kpis.totalProfit / kpis.flockCount).toLocaleString()} avg/flock`
            : 'No active flocks'}
        </div>
      </div>
    </div>
  );
}
