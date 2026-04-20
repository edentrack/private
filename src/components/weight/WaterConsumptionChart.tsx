import { useEffect, useState, useCallback, useMemo } from 'react';
import { Droplet } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../contexts/RealtimeContext';
import { useTranslation } from 'react-i18next';
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
import { getGrowthTargets, getTargetWeight } from '../../utils/growthTargets';
import { Flock } from '../../types/database';
import { EditFeedWaterModal } from './EditFeedWaterModal';

function WaterConsumptionTooltip({ active, payload, t }: { active?: boolean; payload?: any[]; t: (k: string) => string }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const actual = data.actualWeight ?? 0;
  const expected = data.expectedWeight ?? 0;
  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 text-xs">
      <p className="font-bold mb-2">{t('weight.week')} {data.week}</p>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded bg-[#F4D03F]" />
        <span>Actual: {Number(actual).toFixed(1)} {t('weight.unit_ml_per_bird_day') || 'ml/bird/day'}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded bg-[#60A5FA]" />
        <span>Expected: {Number(expected).toFixed(1)} {t('weight.unit_ml_per_bird_day') || 'ml/bird/day'}</span>
      </div>
      {actual > 0 && expected > 0 && (
        <p className="mt-2 pt-2 border-t text-[10px]">
          Performance: {((actual / expected) * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

interface WaterConsumptionDataPoint {
  week: number;
  expectedWeight: number;  // same keys as Weight chart for reliable bar rendering
  actualWeight: number;
  date: string;
}

interface WaterConsumptionChartProps {
  flock: Flock | null;
}

export function WaterConsumptionChart({ flock }: WaterConsumptionChartProps) {
  const { t } = useTranslation();
  const { currentFarm, currentRole, farmPermissions } = useAuth();
  const { subscribeToTable } = useRealtimeSubscription();
  const [waterData, setWaterData] = useState<WaterConsumptionDataPoint[]>([]);
  const [totalWaterLitersTillDate, setTotalWaterLitersTillDate] = useState(0);
  const [waterUnitToggle, setWaterUnitToggle] = useState<'liters' | 'm3'>('liters');
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const canEdit = currentRole === 'owner' || (currentRole === 'manager' && farmPermissions?.managers_can_edit_feed_water);

  const loadWaterData = useCallback(async () => {
    if (!flock || !currentFarm?.id) return;

    try {
      setLoading(true);
      const arrParts = String(flock.arrival_date).split(/[-T]/);
      const arrivalDate = arrParts.length >= 3
        ? new Date(parseInt(arrParts[0], 10), parseInt(arrParts[1], 10) - 1, parseInt(arrParts[2], 10))
        : new Date(flock.arrival_date);
      arrivalDate.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentWeek = Math.floor(diffDays / 7) + 1;

      const { data: waterUsage } = await supabase
        .from('inventory_usage')
        .select('quantity_used, usage_date')
        .eq('farm_id', currentFarm.id)
        .eq('item_type', 'water')
        .gte('usage_date', flock.arrival_date)
        .order('usage_date', { ascending: true });

      const targets = getGrowthTargets(flock.type || 'layer');
      const weeklyWaterUsage: Record<number, { totalLiters: number; days: number; birdCount: number }> = {};

      if (waterUsage) {
        for (const usage of waterUsage) {
          const usageParts = String(usage.usage_date).split(/[-T]/);
          const usageDate = usageParts.length >= 3
            ? new Date(parseInt(usageParts[0], 10), parseInt(usageParts[1], 10) - 1, parseInt(usageParts[2], 10))
            : new Date(usage.usage_date);
          usageDate.setHours(0, 0, 0, 0);
          const daysSinceArrival = Math.floor((usageDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
          const week = Math.floor(daysSinceArrival / 7) + 1;
          if (week >= 1) {
            const liters = Number(usage.quantity_used) || 0;
            if (!weeklyWaterUsage[week]) {
              weeklyWaterUsage[week] = { totalLiters: 0, days: 0, birdCount: flock.current_count || flock.initial_count || 0 };
            }
            weeklyWaterUsage[week].totalLiters += liters;
            weeklyWaterUsage[week].days += 1;
          }
        }
      }

      const minWeeksToShow = 20;
      const maxWeeks = Math.max(minWeeksToShow, currentWeek);
      const chartData: WaterConsumptionDataPoint[] = [];

      for (let week = 1; week <= maxWeeks; week++) {
        const target = getTargetWeight(flock.type || 'layer', week, targets);
        const expectedWaterConsumption = Number(target.waterConsumptionMlPerBird) || 0;
        const weekUsage = weeklyWaterUsage[week];
        let actualWaterConsumption = 0;
        if (weekUsage && weekUsage.totalLiters > 0 && weekUsage.birdCount > 0) {
          const avgDailyLitersPerBird = weekUsage.totalLiters / (Math.max(1, weekUsage.days) * weekUsage.birdCount);
          actualWaterConsumption = Number((avgDailyLitersPerBird * 1000).toFixed(2));
        }
        chartData.push({
          week,
          expectedWeight: expectedWaterConsumption,
          actualWeight: actualWaterConsumption,
          date: '',
        });
      }

      const totalLiters = Object.values(weeklyWaterUsage).reduce((sum, w) => sum + (w?.totalLiters || 0), 0);
      setWaterData(chartData);
      setTotalWaterLitersTillDate(totalLiters);
    } catch (error) {
      console.error('Error loading water consumption data:', error);
    } finally {
      setLoading(false);
    }
  }, [flock, currentFarm?.id]);

  useEffect(() => {
    if (flock && currentFarm?.id) loadWaterData();
    else setLoading(false);
  }, [flock, currentFarm?.id, loadWaterData]);

  useEffect(() => {
    if (!flock || !currentFarm?.id) return;
    return subscribeToTable('inventory_usage', loadWaterData);
  }, [flock, currentFarm?.id, loadWaterData, subscribeToTable]);

  const handleBarClick = (data: { payload?: { week?: number } }) => {
    if (!canEdit) return;
    const week = data?.payload?.week;
    if (week != null) {
      setSelectedWeek(week);
      setIsEditModalOpen(true);
    }
  };

  // All hooks must run before any conditional returns (Rules of Hooks)
  const displayData = useMemo(() => {
    if (!waterData.length) return [];
    const chartDataFiltered = waterData.filter(d => d.actualWeight > 0 || d.expectedWeight > 0);
    return chartDataFiltered.length > 0 ? chartDataFiltered : waterData;
  }, [waterData]);

  const latestData = useMemo(() => waterData.filter(d => d.actualWeight > 0).pop(), [waterData]);
  const performancePct = useMemo(() => {
    return latestData && latestData.expectedWeight > 0
      ? (latestData.actualWeight / latestData.expectedWeight) * 100 : 0;
  }, [latestData]);

  const openLatestWeekForEdit = () => {
    if (!canEdit || !waterData.length) return;
    // Prefer the latest week that has any data; fall back to last week in array
    const withData = [...waterData].filter(d => d.actualWeight > 0 || d.expectedWeight > 0);
    const target = (withData.length ? withData : waterData)[(withData.length ? withData : waterData).length - 1];
    if (!target?.week) return;
    setSelectedWeek(target.week);
    setIsEditModalOpen(true);
  };

  if (loading) {
    return (
      <div className="section-card animate-fade-in bg-gradient-to-br from-blue-50 to-white border border-blue-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('weight.water_consumption_tracking') || 'Water Consumption Tracking'}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t('dashboard.actual_vs_expected')}</div>
          </div>
          <Droplet className="w-4 h-4 text-blue-600" />
        </div>
        <div className="h-32 flex items-center justify-center text-gray-400 text-[10px]">{t('common.loading')}</div>
      </div>
    );
  }

  if (!flock || waterData.length === 0) {
    return (
      <div className="section-card animate-fade-in bg-gradient-to-br from-blue-50 to-white border border-blue-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('weight.water_consumption_tracking') || 'Water Consumption Tracking'}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t('dashboard.actual_vs_expected')}</div>
          </div>
          <Droplet className="w-4 h-4 text-blue-600" />
        </div>
        <div className="h-32 flex items-center justify-center text-gray-400 text-[10px]">
          {!flock ? t('weight.select_flock_to_view') : t('weight.no_water_data') || 'No water data available'}
        </div>
        {flock && (
          <div className="mt-2 pt-3 pb-2 border-t-2 border-blue-200 bg-blue-50/60 rounded-lg px-3 flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-600">{t('weight.total_water_till_date') || 'Total water till date'}</span>
            <span className="text-sm font-bold text-blue-700">0 {t('weight.unit_liters') || 'L'}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="section-card animate-fade-in bg-gradient-to-br from-blue-50 to-white border border-blue-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('weight.water_consumption_tracking') || 'Water Consumption Tracking'}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{t('dashboard.actual_vs_expected')}</div>
        </div>
        <div className="flex items-center gap-2">
          {latestData && latestData.actualWeight > 0 && (
            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              performancePct >= 95 ? 'bg-green-100 text-green-800' : performancePct >= 85 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
            }`}>
              {performancePct.toFixed(1)}%
            </div>
          )}
          <Droplet className="w-4 h-4 text-blue-600" />
        </div>
      </div>

      <div className="mt-2 w-full" style={{ height: 200, minHeight: 200 }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={displayData}
            margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
            barCategoryGap={4}
            barGap={2}
            style={{ cursor: canEdit ? 'pointer' : 'default' }}
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
              domain={[0, 'dataMax']}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip content={(props: any) => <WaterConsumptionTooltip {...props} t={t} />} />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} iconType="rect" />
            <Bar dataKey="actualWeight" name={t('weight.actual') || 'Actual'} fill="#F4D03F" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} onClick={canEdit ? handleBarClick : undefined} cursor={canEdit ? 'pointer' : undefined} />
            <Bar dataKey="expectedWeight" name={t('weight.expected') || 'Expected'} fill="#60A5FA" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} onClick={canEdit ? handleBarClick : undefined} cursor={canEdit ? 'pointer' : undefined} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {canEdit && waterData.length > 0 && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={openLatestWeekForEdit}
            className="px-3 py-1.5 text-[11px] rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition-colors"
          >
            {t('weight.edit_water_button') || 'Edit latest water records'}
          </button>
        </div>
      )}

      {canEdit && (
        <p className="text-[10px] text-gray-500 mt-2 text-center">
          {t('weight.click_week_to_edit_water') || 'Click on a week to edit water records'}
        </p>
      )}

      {selectedWeek && (
        <EditFeedWaterModal
          isOpen={isEditModalOpen}
          onClose={() => { setIsEditModalOpen(false); setSelectedWeek(null); }}
          flock={flock}
          week={selectedWeek}
          type="water"
          onSuccess={loadWaterData}
        />
      )}

      <div className="mt-3 pt-2 border-t border-blue-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {latestData && latestData.actualWeight > 0 && (
          <>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.latest')}</div>
              <div className="text-sm font-bold text-blue-600">{latestData.actualWeight.toFixed(1)} {t('weight.unit_ml_per_bird_day') || 'ml/bird/day'}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.performance')}</div>
              <div className={`text-sm font-bold ${performancePct >= 95 ? 'text-green-600' : performancePct >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                {performancePct.toFixed(1)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.expected')}</div>
              <div className="text-sm font-bold text-sky-600">{latestData.expectedWeight.toFixed(1)}ml</div>
            </div>
          </>
        )}
        {waterData.length > 0 && (
          <div className={`text-center ${latestData?.actualWeight ? '' : 'sm:col-span-2'}`}>
            <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.total_water_till_date') || 'Total water'}</div>
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <span className="text-sm font-bold text-blue-700">
                {waterUnitToggle === 'liters'
                  ? totalWaterLitersTillDate >= 1000
                    ? `${(totalWaterLitersTillDate / 1000).toFixed(1)}k`
                    : totalWaterLitersTillDate.toFixed(0)
                  : (totalWaterLitersTillDate / 1000).toFixed(2)}
                {' '}
                {waterUnitToggle === 'liters' ? (t('weight.unit_liters') || 'L') : 'm³'}
              </span>
              <select
                value={waterUnitToggle}
                onChange={(e) => setWaterUnitToggle(e.target.value as 'liters' | 'm3')}
                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border-0 cursor-pointer"
              >
                <option value="liters">{t('weight.unit_liters') || 'Liters'}</option>
                <option value="m3">m³</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
