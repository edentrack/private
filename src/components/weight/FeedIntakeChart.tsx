import { useEffect, useState, useCallback, useMemo } from 'react';
import { Package } from 'lucide-react';
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
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getGrowthTargets, getTargetWeight } from '../../utils/growthTargets';
import { Flock } from '../../types/database';
import { getFeedConversionSettings, convertFeedToKg, convertKgToFeedUnit, FeedConversionSettings } from '../../utils/feedConversions';
import { EditFeedWaterModal } from './EditFeedWaterModal';

function FeedIntakeTooltip({ active, payload, t }: { active?: boolean; payload?: any[]; t: (k: string) => string }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const actual = data.actualWeight ?? 0;
  const expected = data.expectedWeight ?? 0;
  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 text-xs">
      <p className="font-bold mb-2">{t('weight.week')} {data.week}</p>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded bg-[#F4D03F]" />
        <span>Actual: {Number(actual).toFixed(1)} {t('weight.unit_g_per_bird_day') || 'g/bird/day'}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded bg-[#60A5FA]" />
        <span>Expected: {Number(expected).toFixed(1)} {t('weight.unit_g_per_bird_day') || 'g/bird/day'}</span>
      </div>
      {actual > 0 && expected > 0 && (
        <p className="mt-2 pt-2 border-t text-[10px]">
          Performance: {((actual / expected) * 100).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

interface FeedIntakeDataPoint {
  week: number;
  expectedWeight: number;  // recharts Bar renders better with these keys (matches Weight chart)
  actualWeight: number;
  date: string;
}

interface FeedIntakeChartProps {
  flock: Flock | null;
}

export function FeedIntakeChart({ flock }: FeedIntakeChartProps) {
  const { t } = useTranslation();
  const { currentFarm, currentRole, farmPermissions } = useAuth();
  const { subscribeToTable } = useRealtimeSubscription();
  const [feedData, setFeedData] = useState<FeedIntakeDataPoint[]>([]);
  const [recordsByWeek, setRecordsByWeek] = useState<Record<number, Array<{ id: string; date: string; quantity: number; unit: string; feed_type_id?: string; feed_type_name?: string; quantityKg?: number }>>>({});
  const [totalFeedKgTillDate, setTotalFeedKgTillDate] = useState(0);
  const [feedSettings, setFeedSettings] = useState<FeedConversionSettings | null>(null);
  const [totalUnitToggle, setTotalUnitToggle] = useState<'bags' | 'kg' | 'g' | 'tonnes'>('bags');
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const canEdit = currentRole === 'owner' || (currentRole === 'manager' && farmPermissions?.managers_can_edit_feed_water);

  const loadFeedData = useCallback(async () => {
    if (!flock || !currentFarm?.id) return;

    try {
      setLoading(true);
      // Parse arrival_date as local date to avoid timezone off-by-one (match EditFeedWaterModal)
      const arrParts = String(flock.arrival_date).split(/[-T]/);
      const arrivalDate = arrParts.length >= 3
        ? new Date(parseInt(arrParts[0], 10), parseInt(arrParts[1], 10) - 1, parseInt(arrParts[2], 10))
        : new Date(flock.arrival_date);
      arrivalDate.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
      const currentWeek = Math.floor(diffDays / 7) + 1;

      const feedSettings = await getFeedConversionSettings(currentFarm.id);
      // Fetch from 7 days before arrival so records dated slightly before (e.g. day before) are included in Week 1
      const queryStart = new Date(arrivalDate);
      queryStart.setDate(queryStart.getDate() - 7);
      const queryStartStr = queryStart.toISOString().split('T')[0];
      const { data: feedUsage } = await supabase
        .from('inventory_usage')
        .select(`id, quantity_used, usage_date, feed_type_id, feed_type:feed_types(id, name, unit, kg_per_unit)`)
        .eq('farm_id', currentFarm.id)
        .eq('item_type', 'feed')
        .gte('usage_date', queryStartStr)
        .order('usage_date', { ascending: true });

      let customFeedTargets: Record<string, number> | null = null;
      try {
        const colPrefix = flock.type === 'broiler' ? 'broiler' : 'layer';
        const { data: farmData } = await supabase
          .from('farms')
          .select(`${colPrefix}_feed_intake_targets, ${colPrefix}_total_duration_weeks`)
          .eq('id', currentFarm.id)
          .single();
        if (farmData) {
          const targets = flock.type === 'layer' ? (farmData as any).layer_feed_intake_targets : (farmData as any).broiler_feed_intake_targets;
          if (targets && typeof targets === 'object') customFeedTargets = targets as Record<string, number>;
        }
      } catch {
        // Columns may not exist if migrations haven't run - use growth targets
      }
      const growthTargets = getGrowthTargets(flock.type || 'layer');

      const weeklyFeedUsage: Record<number, { totalKg: number; birdCount: number }> = {};
      const byWeek: Record<number, Array<{ id: string; date: string; quantity: number; unit: string; feed_type_id?: string; feed_type_name?: string }>> = {};
      if (feedUsage) {
        for (const usage of feedUsage) {
          const usageParts = String(usage.usage_date).split(/[-T]/);
          const usageDate = usageParts.length >= 3
            ? new Date(parseInt(usageParts[0], 10), parseInt(usageParts[1], 10) - 1, parseInt(usageParts[2], 10))
            : new Date(usage.usage_date);
          usageDate.setHours(0, 0, 0, 0);
          const daysSinceArrival = Math.floor((usageDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
          // Map to week: days -6..0 → week 1, days 1-7 → week 2, etc. (records slightly before arrival count as week 1)
          const w = daysSinceArrival < 0 ? 1 : Math.floor(daysSinceArrival / 7) + 1;
          if (w >= 1) {
            const quantity = Number(usage.quantity_used) || 0;
            const ft = usage.feed_type as any;
            const storedUnit = ft?.unit || feedSettings.feedUnit;
            const kgPerUnit = ft?.kg_per_unit != null ? Number(ft.kg_per_unit) : null;
            const settingsForConversion = kgPerUnit != null && kgPerUnit > 0
              ? { ...feedSettings, quantityPerBag: kgPerUnit }
              : feedSettings;
            const kg = convertFeedToKg(quantity, storedUnit, settingsForConversion);
            if (!weeklyFeedUsage[w]) {
              weeklyFeedUsage[w] = { totalKg: 0, birdCount: flock.current_count || flock.initial_count || 0 };
            }
            weeklyFeedUsage[w].totalKg += kg;
            const converted = convertKgToFeedUnit(kg, settingsForConversion);
            if (!byWeek[w]) byWeek[w] = [];
            byWeek[w].push({
              id: usage.id,
              date: String(usage.usage_date).split('T')[0],
              quantity: converted.quantity,
              unit: converted.unit,
              feed_type_id: usage.feed_type_id,
              feed_type_name: ft?.name,
              quantityKg: kg,
            });
          }
        }
      }

      const minWeeksToShow = 20;
      const maxWeeks = Math.max(minWeeksToShow, currentWeek);
      const chartData: FeedIntakeDataPoint[] = [];

      for (let week = 1; week <= maxWeeks; week++) {
        let expectedFeedIntake = 0;
        if (customFeedTargets && customFeedTargets[week.toString()]) {
          expectedFeedIntake = Number(customFeedTargets[week.toString()]) || 0;
        } else {
          const target = getTargetWeight(flock.type || 'layer', week, growthTargets);
          expectedFeedIntake = Number(target.feedIntakeGPerBird) || 0;
        }

        const weekUsage = weeklyFeedUsage[week];
        let actualFeedIntake = 0;
        if (weekUsage && weekUsage.totalKg > 0 && weekUsage.birdCount > 0) {
          const avgDailyKgPerBird = weekUsage.totalKg / (7 * weekUsage.birdCount);
          actualFeedIntake = Number((avgDailyKgPerBird * 1000).toFixed(2));
        }

        chartData.push({
          week,
          expectedWeight: expectedFeedIntake,
          actualWeight: actualFeedIntake,
          date: '',
        });
      }

      const totalKg = Object.values(weeklyFeedUsage).reduce((sum, w) => sum + (w?.totalKg || 0), 0);
      setFeedData(chartData);
      setRecordsByWeek(byWeek);
      setTotalFeedKgTillDate(totalKg);
      setFeedSettings(feedSettings);
    } catch (error) {
      console.error('Error loading feed intake data:', error);
    } finally {
      setLoading(false);
    }
  }, [flock, currentFarm?.id]);

  useEffect(() => {
    if (flock && currentFarm?.id) loadFeedData();
    else setLoading(false);
  }, [flock, currentFarm?.id, loadFeedData]);

  useEffect(() => {
    if (!flock || !currentFarm?.id) return;
    return subscribeToTable('inventory_usage', loadFeedData);
  }, [flock, currentFarm?.id, loadFeedData, subscribeToTable]);

  const handleBarClick = (data: { payload?: { week?: number; actualWeight?: number; expectedWeight?: number } }) => {
    if (!canEdit) return;
    const week = data?.payload?.week;
    if (week != null) {
      setSelectedWeek(week);
      setIsEditModalOpen(true);
    }
  };

  // All hooks must run before any conditional returns (Rules of Hooks)
  const displayData = useMemo(() => {
    if (!feedData.length) return [];
    const chartDataFiltered = feedData.filter(d => d.actualWeight > 0 || d.expectedWeight > 0);
    return chartDataFiltered.length > 0 ? chartDataFiltered : feedData;
  }, [feedData]);

  const latestData = useMemo(() => feedData.filter(d => d.actualWeight > 0).pop(), [feedData]);
  const performancePct = useMemo(() => {
    return latestData && latestData.expectedWeight > 0
      ? (latestData.actualWeight / latestData.expectedWeight) * 100 : 0;
  }, [latestData]);

  if (loading) {
    return (
      <div className="section-card animate-fade-in bg-gradient-to-br from-green-50 to-white border border-green-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('weight.feed_intake_tracking') || 'Feed Intake Tracking'}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t('dashboard.actual_vs_expected')}</div>
          </div>
          <Package className="w-4 h-4 text-green-600" />
        </div>
        <div className="h-32 flex items-center justify-center text-gray-400 text-[10px]">{t('common.loading')}</div>
      </div>
    );
  }

  if (!flock || feedData.length === 0) {
    return (
      <div className="section-card animate-fade-in bg-gradient-to-br from-green-50 to-white border border-green-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('weight.feed_intake_tracking') || 'Feed Intake Tracking'}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t('dashboard.actual_vs_expected')}</div>
          </div>
          <Package className="w-4 h-4 text-green-600" />
        </div>
        <div className="h-32 flex items-center justify-center text-gray-400 text-[10px]">
          {!flock ? t('weight.select_flock_to_view') : t('weight.no_feed_data') || 'No feed data available'}
        </div>
        {flock && (
          <div className="mt-2 pt-3 pb-2 border-t-2 border-green-200 bg-green-50/60 rounded-lg px-3 flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-600">{t('weight.total_feed_till_date') || 'Total feed till date'}</span>
            <span className="text-sm font-bold text-green-700">0 {t('weight.bags') || 'bags'}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="section-card animate-fade-in bg-gradient-to-br from-green-50 to-white border border-green-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('weight.feed_intake_tracking') || 'Feed Intake Tracking'}</div>
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
          <Package className="w-4 h-4 text-green-600" />
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
          <Tooltip content={(props: any) => <FeedIntakeTooltip {...props} t={t} />} />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} iconType="rect" />
          <Bar dataKey="actualWeight" name={t('weight.actual') || 'Actual'} fill="#F4D03F" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} onClick={canEdit ? handleBarClick : undefined} cursor={canEdit ? 'pointer' : undefined} />
          <Bar dataKey="expectedWeight" name={t('weight.expected') || 'Expected'} fill="#60A5FA" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} onClick={canEdit ? handleBarClick : undefined} cursor={canEdit ? 'pointer' : undefined} />
        </BarChart>
        </ResponsiveContainer>
      </div>

      {canEdit && (
        <p className="text-[10px] text-gray-500 mt-2 text-center">
          {t('weight.click_week_to_edit_feed') || 'Click on a week to edit feed records'}
        </p>
      )}

      {selectedWeek && (
        <EditFeedWaterModal
          isOpen={isEditModalOpen}
          onClose={() => { setIsEditModalOpen(false); setSelectedWeek(null); }}
          flock={flock}
          week={selectedWeek}
          type="feed"
          onSuccess={loadFeedData}
          initialRecords={(recordsByWeek[selectedWeek] || []).map(r => ({ ...r, type: 'feed' as const, source: 'inventory_usage' as const }))}
        />
      )}

      <div className="mt-3 pt-2 border-t border-green-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(latestData?.actualWeight ?? 0) > 0 && (
          <>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.latest')}</div>
              <div className="text-sm font-bold text-green-600">{latestData!.actualWeight.toFixed(1)} {t('weight.unit_g_per_bird_day') || 'g/bird/day'}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.performance')}</div>
              <div className={`text-sm font-bold ${performancePct >= 95 ? 'text-green-600' : performancePct >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                {performancePct.toFixed(1)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.expected')}</div>
              <div className="text-sm font-bold text-blue-600">{latestData!.expectedWeight.toFixed(1)}g</div>
            </div>
          </>
        )}
        {feedData.length > 0 && (
          <div className={`text-center ${(latestData?.actualWeight ?? 0) > 0 ? '' : 'sm:col-span-2'}`}>
            <div className="text-[10px] text-gray-500 mb-0.5">{t('weight.total_feed_till_date') || 'Total feed'}</div>
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <span className="text-sm font-bold text-green-700">
                {totalUnitToggle === 'bags' && (feedSettings?.quantityPerBag
                  ? (totalFeedKgTillDate / feedSettings.quantityPerBag).toFixed(1)
                  : (totalFeedKgTillDate / 50).toFixed(1))}
                {totalUnitToggle === 'kg' && totalFeedKgTillDate.toFixed(1)}
                {totalUnitToggle === 'g' && (totalFeedKgTillDate * 1000).toFixed(0)}
                {totalUnitToggle === 'tonnes' && (totalFeedKgTillDate / 1000).toFixed(2)}
                {' '}
                {totalUnitToggle === 'bags' && (t('weight.bags') || 'bags')}
                {totalUnitToggle === 'kg' && 'kg'}
                {totalUnitToggle === 'g' && (t('weight.grams') || 'g')}
                {totalUnitToggle === 'tonnes' && (t('weight.unit_tonnes') || 't')}
              </span>
              <select
                value={totalUnitToggle}
                onChange={(e) => setTotalUnitToggle(e.target.value as 'bags' | 'kg' | 'g' | 'tonnes')}
                className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border-0 cursor-pointer"
              >
                <option value="bags">{t('weight.bags') || 'bags'}</option>
                <option value="kg">kg</option>
                <option value="g">{t('weight.grams') || 'g'}</option>
                <option value="tonnes">{t('weight.unit_tonnes') || 't'}</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
