import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';

interface FlockFinancialSummaryProps {
  flock: Flock | null;
  compact?: boolean;
}

interface FinancialData {
  totalExpenses: number;
  totalRevenue: number;
  profit: number;
}

export function FlockFinancialSummary({ flock, compact = false }: FlockFinancialSummaryProps) {
  const { profile } = useAuth();
  const [financials, setFinancials] = useState<FinancialData>({
    totalExpenses: 0,
    totalRevenue: 0,
    profit: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (flock) {
      loadFinancials();
    } else {
      setFinancials({ totalExpenses: 0, totalRevenue: 0, profit: 0 });
      setLoading(false);
    }
  }, [flock]);

  const loadFinancials = async () => {
    if (!flock) return;

    setLoading(true);
    try {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('flock_id', flock.id);

      const { data: revenues } = await supabase
        .from('revenues')
        .select('amount, transport_cost')
        .eq('flock_id', flock.id);

      const totalExpenses = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
      const grossRevenue = revenues?.reduce((sum, rev) => sum + rev.amount, 0) || 0;
      const totalTransportCosts = revenues?.reduce((sum, rev) => sum + (rev.transport_cost || 0), 0) || 0;
      const totalRevenue = grossRevenue - totalTransportCosts;
      const profit = totalRevenue - totalExpenses;

      setFinancials({
        totalExpenses,
        totalRevenue,
        profit
      });
    } catch (error) {
      console.error('Error loading financials:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!flock) {
    return (
      <div className={`bg-white rounded-${compact ? 'xl' : '3xl'} ${compact ? 'p-4' : 'p-6'}`}>
        <div className={`flex items-center gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
          <div className="icon-circle-yellow">
            <Wallet className={`${compact ? 'w-5 h-5' : 'w-6 h-6'}`} />
          </div>
          <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-gray-900`}>Flock Financial Summary</h3>
        </div>
        <p className={`text-gray-500 text-center ${compact ? 'py-6' : 'py-8'}`}>
          Select a flock to view financial summary
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`bg-white rounded-${compact ? 'xl' : '3xl'} ${compact ? 'p-4' : 'p-6'}`}>
        <div className={`flex items-center gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
          <div className="icon-circle-yellow">
            <Wallet className={`${compact ? 'w-5 h-5' : 'w-6 h-6'}`} />
          </div>
          <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-gray-900`}>Flock Financial Summary</h3>
        </div>
        <div className={`text-center ${compact ? 'py-6' : 'py-8'} text-gray-500`}>Loading...</div>
      </div>
    );
  }

  const profitMargin = financials.totalRevenue > 0
    ? ((financials.profit / financials.totalRevenue) * 100)
    : 0;

  return (
    <div className={`bg-white rounded-${compact ? 'xl' : '3xl'} ${compact ? 'p-4' : 'p-6'} transition-all duration-300`}>
      <div className={`flex items-center gap-3 ${compact ? 'mb-4' : 'mb-6'}`}>
        <div className="icon-circle-yellow">
          <Wallet className={`${compact ? 'w-5 h-5' : 'w-6 h-6'}`} />
        </div>
        <div>
          <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-gray-900`}>Flock Financial Summary</h3>
          <p className="text-sm text-gray-600">{flock.name}</p>
        </div>
      </div>

      <div className={`grid md:grid-cols-3 ${compact ? 'gap-3' : 'gap-4'}`}>
        <div className={`${compact ? 'p-3' : 'p-4'} bg-red-50 rounded-xl transform transition-all duration-200 hover:scale-105`}>
          <div className={`flex items-center justify-between ${compact ? 'mb-1.5' : 'mb-2'}`}>
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-red-900`}>Total Expenses</span>
            <TrendingDown className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-red-600`} />
          </div>
          <div className={`${compact ? 'text-xl' : 'text-2xl'} font-bold text-red-900`}>
            {financials.totalExpenses.toLocaleString()}
          </div>
          <div className="text-xs text-red-700 mt-1">
            {profile?.currency_preference || 'CFA'}
          </div>
        </div>

        <div className={`${compact ? 'p-3' : 'p-4'} bg-neon-100 rounded-xl transform transition-all duration-200 hover:scale-105`}>
          <div className={`flex items-center justify-between ${compact ? 'mb-1.5' : 'mb-2'}`}>
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-neon-900`}>Total Revenue</span>
            <TrendingUp className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-neon-700`} />
          </div>
          <div className={`${compact ? 'text-xl' : 'text-2xl'} font-bold text-neon-900`}>
            {financials.totalRevenue.toLocaleString()}
          </div>
          <div className="text-xs text-neon-700 mt-1">
            {profile?.currency_preference || 'CFA'}
          </div>
        </div>

        <div className={`${compact ? 'p-3' : 'p-4'} rounded-xl transform transition-all duration-200 hover:scale-105 ${
          financials.profit >= 0 ? 'bg-gray-100' : 'bg-orange-50'
        }`}>
          <div className={`flex items-center justify-between ${compact ? 'mb-1.5' : 'mb-2'}`}>
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium ${
              financials.profit >= 0 ? 'text-gray-900' : 'text-orange-900'
            }`}>
              Net Profit
            </span>
            <DollarSign className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} ${
              financials.profit >= 0 ? 'text-gray-700' : 'text-orange-600'
            }`} />
          </div>
          <div className={`${compact ? 'text-xl' : 'text-2xl'} font-bold ${
            financials.profit >= 0 ? 'text-gray-900' : 'text-orange-900'
          }`}>
            {financials.profit >= 0 ? '+' : ''}{financials.profit.toLocaleString()}
          </div>
          <div className={`text-xs mt-1 ${
            financials.profit >= 0 ? 'text-gray-700' : 'text-orange-700'
          }`}>
            {profitMargin.toFixed(1)}% margin
          </div>
        </div>
      </div>

      <div className={`${compact ? 'mt-3 p-3' : 'mt-4 p-4'} bg-gray-50 rounded-xl`}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Revenue / Expense Ratio:</span>
          <span className="font-bold text-gray-900">
            {financials.totalExpenses > 0
              ? (financials.totalRevenue / financials.totalExpenses).toFixed(2)
              : '0.00'}x
          </span>
        </div>
      </div>
    </div>
  );
}
