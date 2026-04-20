import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Target, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';

interface AdvancedMetricsProps {
  flock: Flock;
  compact?: boolean;
}

interface Metrics {
  fcr: number;
  averageDailyGain: number;
  survivalRate: number;
  projectedProfit: number;
  breakEvenPoint: number;
  expectedRevenue: number;
  roi: number;
}

export function AdvancedMetrics({ flock, compact = false }: AdvancedMetricsProps) {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>({
    fcr: 0,
    averageDailyGain: 0,
    survivalRate: 0,
    projectedProfit: 0,
    breakEvenPoint: 0,
    expectedRevenue: 0,
    roi: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (flock) {
      calculateMetrics();
    }
  }, [flock]);

  const calculateMetrics = async () => {
    if (!flock || !profile?.farm_id) return;

    setLoading(true);
    try {
      const flockAge = Math.floor(
        (Date.now() - new Date(flock.arrival_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      const [expensesRes, weightRes, eggSalesRes, mortalityRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('amount, category')
          .eq('flock_id', flock.id),
        supabase
          .from('weight_logs')
          .select('average_weight, date')
          .eq('flock_id', flock.id)
          .order('date', { ascending: false })
          .limit(1),
        supabase
          .from('egg_sales')
          .select('trays_sold, unit_price')
          .eq('flock_id', flock.id),
        supabase
          .from('mortality_logs')
          .select('count')
          .eq('flock_id', flock.id),
      ]);

      const totalExpenses = (expensesRes.data || []).reduce(
        (sum, exp) => sum + exp.amount,
        0
      );
      const feedExpenses = (expensesRes.data || [])
        .filter((exp) => exp.category === 'feed')
        .reduce((sum, exp) => sum + exp.amount, 0);

      const currentWeight = weightRes.data?.[0]?.average_weight || 0;
      const totalRevenue = (eggSalesRes.data || []).reduce(
        (sum, sale) => sum + sale.trays_sold * sale.unit_price,
        0
      );

      const totalMortality = (mortalityRes.data || []).reduce((sum, log) => sum + (log.count || 0), 0);
      const survivalRate = flock.initial_count > 0
        ? ((flock.initial_count - totalMortality) / flock.initial_count) * 100
        : 100;
      const averageDailyGain = flockAge > 0 ? (currentWeight * 1000) / flockAge : 0;

      const fcr = feedExpenses > 0 && currentWeight > 0
        ? feedExpenses / (flock.current_count * currentWeight)
        : 0;

      const expectedMaturityWeight = flock.type === 'Broiler' ? 2.5 : 1.8;
      const expectedMaturityAge = flock.type === 'Broiler' ? 42 : 140;
      const daysRemaining = Math.max(0, expectedMaturityAge - flockAge);

      const projectedFinalWeight = currentWeight + (averageDailyGain * daysRemaining) / 1000;
      const pricePerKg = flock.type === 'Broiler' ? 5 : 8;
      const expectedRevenue = flock.current_count * projectedFinalWeight * pricePerKg + totalRevenue;

      const projectedProfit = expectedRevenue - totalExpenses;
      const roi = totalExpenses > 0 ? (projectedProfit / totalExpenses) * 100 : 0;
      const breakEvenPoint = expectedRevenue > 0
        ? (totalExpenses / expectedRevenue) * 100
        : 0;

      setMetrics({
        fcr,
        averageDailyGain,
        survivalRate,
        projectedProfit,
        breakEvenPoint,
        expectedRevenue,
        roi,
      });
    } catch (error) {
      console.error('Error calculating metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 border-2 border-gray-200">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          <span className="text-gray-500">Loading metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Feed Conversion Ratio"
            value={metrics.fcr.toFixed(2)}
            subtitle="Lower is better"
            icon={<Activity className="w-5 h-5" />}
            color="yellow"
            benchmark={flock.type === 'Broiler' ? '1.8' : '2.2'}
          />
          <MetricCard
            title="Avg Daily Gain"
            value={`${metrics.averageDailyGain.toFixed(1)}g`}
            subtitle="Per bird"
            icon={<TrendingUp className="w-5 h-5" />}
            color="gray"
          />
          <MetricCard
            title="Survival Rate"
            value={`${metrics.survivalRate.toFixed(1)}%`}
            subtitle={`${flock.current_count}/${flock.initial_count} alive`}
            icon={<Target className="w-5 h-5" />}
            color={metrics.survivalRate >= 95 ? 'green' : metrics.survivalRate >= 90 ? 'orange' : 'red'}
          />
          <MetricCard
            title="ROI"
            value={`${metrics.roi.toFixed(1)}%`}
            subtitle="Return on investment"
            icon={metrics.roi >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            color={metrics.roi >= 20 ? 'green' : metrics.roi >= 0 ? 'orange' : 'red'}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Financial Projections</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-6 border-2 border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Projected Revenue</div>
            <div className="text-2xl font-bold text-gray-900">
              {profile?.currency_preference} {metrics.expectedRevenue.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border-2 border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Projected Profit</div>
            <div className={`text-2xl font-bold ${metrics.projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {profile?.currency_preference} {metrics.projectedProfit.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border-2 border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Break-Even Point</div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.breakEvenPoint.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">of expected revenue</div>
          </div>
        </div>
      </div>

      <div className="bg-neon-50 border border-neon-200 rounded-xl p-4">
        <h4 className="font-medium text-gray-900 mb-2">Insights & Recommendations</h4>
        <ul className="space-y-2 text-sm text-gray-800">
          {metrics.fcr > 2.5 && (
            <li>• FCR is higher than optimal. Consider reviewing feed quality and feeding schedule.</li>
          )}
          {metrics.survivalRate < 95 && (
            <li>• Survival rate is below industry standard. Review biosecurity and health protocols.</li>
          )}
          {metrics.averageDailyGain < 30 && flock.type === 'Broiler' && (
            <li>• Daily weight gain is low. Ensure adequate nutrition and check for health issues.</li>
          )}
          {metrics.roi >= 20 && (
            <li>• Excellent ROI! Your flock is performing above expectations.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: 'yellow' | 'gray' | 'orange' | 'red' | 'green';
  benchmark?: string;
}

function MetricCard({ title, value, subtitle, icon, color, benchmark }: MetricCardProps) {
  const colorClasses = {
    yellow: 'bg-neon-100 text-neon-600',
    gray: 'bg-gray-100 text-gray-600',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
    green: 'bg-green-100 text-green-600',
  };

  return (
    <div className="bg-white rounded-2xl p-6 border-2 border-gray-200">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-xs text-gray-500">
        {subtitle}
        {benchmark && ` (Target: ${benchmark})`}
      </div>
    </div>
  );
}
