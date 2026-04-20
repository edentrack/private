import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, Scale, Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface WeightProgressWidgetProps {
  flockId: string | null;
}

interface WeightDataPoint {
  week: number;
  actualWeight: number;
  expectedWeight: number;
  expectedMin?: number;
  expectedMax?: number;
  performance?: string;
  date: string;
}

// Breed standard weights
const BREED_STANDARDS: Record<string, Array<{ week: number; min: number; expected: number; max: number }>> = {
  broiler: [
    { week: 0, min: 40, expected: 45, max: 50 },
    { week: 1, min: 120, expected: 140, max: 160 },
    { week: 2, min: 350, expected: 400, max: 450 },
    { week: 3, min: 750, expected: 850, max: 950 },
    { week: 4, min: 1300, expected: 1500, max: 1700 },
    { week: 5, min: 1900, expected: 2200, max: 2500 },
    { week: 6, min: 2500, expected: 2900, max: 3300 },
    { week: 7, min: 3000, expected: 3500, max: 4000 },
    { week: 8, min: 3400, expected: 4000, max: 4600 },
  ],
  layer: [
    { week: 0, min: 35, expected: 40, max: 45 },
    { week: 1, min: 120, expected: 150, max: 180 },
    { week: 2, min: 200, expected: 250, max: 300 },
    { week: 4, min: 400, expected: 500, max: 600 },
    { week: 8, min: 800, expected: 900, max: 1000 },
    { week: 12, min: 1100, expected: 1200, max: 1300 },
    { week: 16, min: 1300, expected: 1450, max: 1600 },
    { week: 18, min: 1400, expected: 1550, max: 1700 },
    { week: 20, min: 1400, expected: 1600, max: 1800 },
  ],
};

export function WeightProgressWidget({ flockId }: WeightProgressWidgetProps) {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [weightData, setWeightData] = useState<WeightDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [flockType, setFlockType] = useState('broiler');

  useEffect(() => {
    if (currentFarm?.id && flockId) {
      loadWeightData();
    } else {
      setLoading(false);
    }
  }, [currentFarm?.id, flockId]);

  const getExpectedWeight = (ageInWeeks: number, standards: typeof BREED_STANDARDS.broiler) => {
    const exact = standards.find(s => s.week === ageInWeeks);
    if (exact) return exact;

    const before = standards.filter(s => s.week < ageInWeeks).pop();
    const after = standards.find(s => s.week > ageInWeeks);

    if (!before || !after) {
      return standards[0];
    }

    const ratio = (ageInWeeks - before.week) / (after.week - before.week);

    return {
      min: before.min + (after.min - before.min) * ratio,
      expected: before.expected + (after.expected - before.expected) * ratio,
      max: before.max + (after.max - before.max) * ratio,
    };
  };

  const calculatePerformance = (actualWeight: number, expectedWeight: number) => {
    const percentage = (actualWeight / expectedWeight) * 100;

    if (percentage >= 105) return 'excellent';
    if (percentage >= 95) return 'good';
    if (percentage >= 85) return 'fair';
    return 'poor';
  };

  const loadWeightData = async () => {
    if (!currentFarm?.id || !flockId) return;

    try {
      setLoading(true);

      const { data: flock } = await supabase
        .from('flocks')
        .select('arrival_date, purpose, type')
        .eq('id', flockId)
        .single();

      if (!flock) return;

      // Parse arrival_date as local date to avoid timezone off-by-one
      const arrParts = String(flock.arrival_date).split(/[-T]/);
      const arrivalDate = arrParts.length >= 3
        ? new Date(parseInt(arrParts[0], 10), parseInt(arrParts[1], 10) - 1, parseInt(arrParts[2], 10))
        : new Date(flock.arrival_date);
      arrivalDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ageInDays = Math.floor((today.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
      // Week 1 = days 0-6, Week 11 = days 70-76
      const ageInWeeks = Math.max(1, Math.floor(ageInDays / 7) + 1);

      // Determine flock type from type field first, then fallback to purpose
      let type = 'broiler';
      if (flock.type) {
        const typeLower = flock.type.toLowerCase();
        if (typeLower === 'layer') {
          type = 'layer';
        } else if (typeLower === 'broiler') {
          type = 'broiler';
        }
      } else if (flock.purpose) {
        type = flock.purpose === 'layers' ? 'layer' : 'broiler';
      }
      setFlockType(type);

      // Use BREED_STANDARDS for the chart (values are in grams)
      const standards = BREED_STANDARDS[type] || BREED_STANDARDS.broiler;

      const { data: weightLogs } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('flock_id', flockId)
        .order('date', { ascending: true });

      const combinedData: WeightDataPoint[] = [];
      const weeklyWeights = new Map<number, { total: number; count: number; date: string }>();

      if (weightLogs) {
        weightLogs.forEach((log) => {
          // Parse as local date to avoid timezone off-by-one
          const logParts = String(log.date).split(/[-T]/);
          const logDate = logParts.length >= 3
            ? new Date(parseInt(logParts[0], 10), parseInt(logParts[1], 10) - 1, parseInt(logParts[2], 10))
            : new Date(log.date);
          logDate.setHours(0, 0, 0, 0);
          
          // Calculate days since arrival
          const daysSinceArrival = Math.floor((logDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // Calculate week (1-indexed for display: week 1 = days 0-6, week 2 = days 7-13, etc.)
          // For pre-arrival records (negative days), use negative week numbers
          const weekKey = daysSinceArrival < 0 
            ? Math.floor(daysSinceArrival / 7)  // Pre-arrival: -1, -2, etc.
            : Math.floor(daysSinceArrival / 7) + 1;  // Post-arrival: 1, 2, 3, etc.
          
          const existing = weeklyWeights.get(weekKey);
          const weightKg = typeof log.average_weight === 'string'
            ? parseFloat(log.average_weight)
            : log.average_weight;

          const weightGrams = weightKg * 1000;

          if (existing) {
            existing.total += weightGrams;
            existing.count += 1;
          } else {
            weeklyWeights.set(weekKey, {
              total: weightGrams,
              count: 1,
              date: log.date,
            });
          }
        });
      }

      // Find the minimum and maximum weeks from actual data (including negative weeks for pre-arrival records)
      const allWeeks = Array.from(weeklyWeights.keys());
      const minWeek = allWeeks.length > 0 ? Math.min(...allWeeks, 0) : 0;
      const maxWeek = Math.max(
        ageInWeeks,
        allWeeks.length > 0 ? Math.max(...allWeeks) : 0,
        Math.max(...standards.map(s => s.week))
      );

      for (let week = minWeek; week <= maxWeek; week++) {
        const weekData = weeklyWeights.get(week);
        const actualWeight = weekData ? weekData.total / weekData.count : 0;
        
        // Only show expected weights for non-negative weeks (after arrival)
        const expectedPoint = week >= 0 ? getExpectedWeight(week, standards) : {
          expected: 0,
          min: 0,
          max: 0,
        };

        // BREED_STANDARDS are already in grams, so expectedPoint values are in grams
        // actualWeight is also in grams (converted from kg at line 144)
        const expectedWeight = expectedPoint.expected;
        const expectedMin = expectedPoint.min;
        const expectedMax = expectedPoint.max;

        combinedData.push({
          week,
          actualWeight: actualWeight || 0,
          expectedWeight: expectedWeight,
          expectedMin: expectedMin,
          expectedMax: expectedMax,
          performance: actualWeight > 0 && week >= 0 && expectedWeight > 0 ? calculatePerformance(actualWeight, expectedWeight) : undefined,
          date: weekData?.date || '',
        });
      }

      setWeightData(combinedData);
    } catch (error) {
      console.error('Error loading weight data:', error);
    } finally {
      setLoading(false);
    }
  };

  // All hooks must run before any conditional returns (Rules of Hooks)
  const displayData = useMemo(() => 
    weightData.filter(d => d.actualWeight > 0 || d.expectedWeight > 0), 
    [weightData]
  );

  const { latestData, measurements, performanceRate, growthRate } = useMemo(() => {
    const meas = weightData.filter(d => d.actualWeight > 0);
    const latest = meas.length > 0 ? meas[meas.length - 1] : null;
    const excellent = meas.filter(d => d.performance === 'excellent').length;
    const perfRate = meas.length > 0 ? Math.round((excellent / meas.length) * 100) : 0;
    
    let growth = 0;
    if (meas.length >= 2) {
      const first = meas[0];
      const last = meas[meas.length - 1];
      growth = Math.round((last.actualWeight - first.actualWeight) / (last.week - first.week));
    }
    
    return {
      latestData: latest,
      measurements: meas,
      performanceRate: perfRate,
      growthRate: growth,
    };
  }, [weightData]);

  const displayVariance = useMemo(() => {
    const variance = latestData && latestData.expectedWeight > 0
      ? ((latestData.actualWeight - latestData.expectedWeight) / latestData.expectedWeight) * 100
      : 0;
    return Math.max(-100, Math.min(200, variance));
  }, [latestData]);

  const CustomTooltipMemoized = useMemo(() => {
    return function TooltipContent({ active, payload }: any) {
      if (active && payload && payload.length) {
        const data = payload[0].payload;

        return (
          <div className="bg-white p-3 rounded-lg shadow-lg border-2 border-gray-300 text-xs" style={{ color: '#000000' }}>
            <p className="font-bold mb-2 text-black">{t('weight.week')} {data.week}</p>

            {payload.map((entry: any, index: number) => {
              const value = entry.value;
              const name = entry.name;
              const color = entry.color;
              
              if (value === 0 || !value) return null;
              
              return (
                <div key={index} className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: color }}></div>
                  <p className="font-semibold text-black">{name}: {(value / 1000).toFixed(2)}kg ({(value).toFixed(0)}g)</p>
                </div>
              );
            })}

            {data.actualWeight > 0 && data.expectedWeight > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-300">
                <p className="text-[10px] text-black">
                  {t('weight.performance')}:{' '}
                  <span
                    className={`font-bold text-black ${
                      data.performance === 'excellent'
                        ? 'text-[#F4D03F]'
                        : data.performance === 'good'
                        ? 'text-blue-600'
                        : data.performance === 'fair'
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }`}
                  >
                    {data.performance ? t(`weight.${data.performance}`) : ''}
                  </span>
                </p>
                {data.actualWeight > 0 && data.expectedWeight > 0 && (
                  <p className="text-[10px] text-black mt-1">
                    {t('weight.actual')} vs {t('weight.target')}: {((data.actualWeight / data.expectedWeight) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            )}
          </div>
        );
      }
      return null;
    };
  }, [t]);

  if (loading) {
    return (
      <div className="section-card animate-fade-in bg-gradient-to-br from-yellow-50 to-white border border-yellow-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              {t('weight.weight_progress')}
            </div>
          </div>
          <Scale className="w-4 h-4 text-[#F4D03F]" />
        </div>
        <div className="h-32 flex items-center justify-center text-gray-400 text-xs">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!flockId || weightData.length === 0) {
    return (
      <div className="section-card animate-fade-in bg-gradient-to-br from-yellow-50 to-white border border-yellow-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              {t('weight.weight_progress')}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{t('dashboard.actual_vs_expected')}</div>
          </div>
          <Scale className="w-4 h-4 text-[#F4D03F]" />
        </div>
        <div className="h-32 flex items-center justify-center text-gray-400 text-xs">
          {!flockId ? t('weight.select_flock_to_view') : t('weight.no_weight_data')}
        </div>
      </div>
    );
  }

  return (
    <div className="section-card animate-fade-in bg-gradient-to-br from-yellow-50 to-white border border-yellow-100">
      <div className="flex items-center justify-between mb-2">
        <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              {t('weight.weight_tracking')}
            </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {flockType === 'broiler' ? t('weight.broiler_standards') : t('weight.layer_standards')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latestData && (
            <div
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                displayVariance > 0 ? 'bg-[#F4D03F] text-gray-900' : 'bg-amber-500 text-white'
              }`}
            >
              {displayVariance > 0 ? '+' : ''}
              {displayVariance.toFixed(1)}%
            </div>
          )}
          <TrendingUp className="w-4 h-4 text-[#F4D03F]" />
        </div>
      </div>

      {/* Chart */}
      <div className="mt-2">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={displayData}
            margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />

            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              label={{ value: t('weight.week') || 'Week', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: '#6b7280', fontSize: 10 } }}
            />

            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(1)}kg`}
            />

            <Tooltip content={<CustomTooltipMemoized />} />
            <Legend 
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
              iconType="rect"
            />

            {/* Actual Weight Bar */}
            <Bar
              dataKey="actualWeight"
              name={t('weight.actual') || 'Actual'}
              fill="#F4D03F"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            />

            {/* Target/Expected Weight Bar */}
            <Bar
              dataKey="expectedWeight"
              name={t('weight.target') || 'Target'}
              fill="#60A5FA"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      {measurements.length > 0 && (
        <div className="mt-3 pt-2 border-t border-yellow-100 grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.latest')}</div>
            <div className="text-sm font-bold text-[#F4D03F]">
              {(latestData!.actualWeight / 1000).toFixed(2)}kg
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.growth')}</div>
            <div className="text-sm font-bold text-blue-600">{growthRate}g/{t('weight.week_short')}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.performance')}</div>
            <div className="flex items-center justify-center gap-1">
              <Award className="w-3 h-3 text-amber-500" />
              <span className="text-sm font-bold text-gray-700">{performanceRate}%</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
