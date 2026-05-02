import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Egg, Package, AlertTriangle, DollarSign, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';
import { formatEggsCompact } from '../../utils/eggFormatting';
import { useTranslation } from 'react-i18next';
import { calculateFCRForFarm, getFCRStatus } from '../../utils/fcrCalculation';
import { useFarmType } from '../../hooks/useFarmType';

type TimePeriod = 'today' | 'week' | 'month';

interface KPIData {
  layRate: number;
  layRateTrend: number;
  eggsCollected: number;
  eggsSold: number;
  eggsInStock: number;
  feedStock: number;
  feedUsage: number;
  feedPerBird: number;
  mortalityRate: number;
  mortalityTrend: number;
  profitSnapshot: number;
  fcr: number | null;
  isLayerFarm: boolean;
  isMixedFarm: boolean;
  fcrReason?: string;
}

interface CoreKPISectionProps {
  /** When this value changes, KPIs (including egg counts) are refetched */
  refreshTrigger?: number;
}

export function CoreKPISection({ refreshTrigger }: CoreKPISectionProps) {
  const { t } = useTranslation();
  const { profile, currentFarm } = useAuth();
  const { showEggs, showFCR } = useFarmType();
  const [period, setPeriod] = useState<TimePeriod>('today');
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [loading, setLoading] = useState(true);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [showFCRTooltip, setShowFCRTooltip] = useState(false);

  useEffect(() => {
    if (currentFarm) {
      loadKPIs();
    }
  }, [currentFarm, period, refreshTrigger]);

  const getDateRange = (): { start: string; end: string } => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];

    let start: Date;
    switch (period) {
      case 'today':
        start = now;
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    return { start: start.toISOString().split('T')[0], end };
  };

  const loadKPIs = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const { data: farmData } = await supabase
        .from('farms')
        .select('eggs_per_tray')
        .eq('id', currentFarm.id)
        .maybeSingle();
      if (farmData?.eggs_per_tray) {
        setEggsPerTray(farmData.eggs_per_tray);
      }
      const { start, end } = getDateRange();

      const { data: flocksData } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active');

      const activeFlocks = flocksData || [];
      setFlocks(activeFlocks);

      const layerFlocks = activeFlocks.filter((f) => f.type === 'Layer');
      const totalLayerBirds = layerFlocks.reduce((sum, f) => sum + f.current_count, 0);

      const { data: collections } = await supabase
        .from('egg_collections')
        .select('trays, broken, total_eggs, collected_on')
        .eq('farm_id', currentFarm.id)
        .gte('collected_on', start)
        .lte('collected_on', end);

      const { data: sales } = await supabase
        .from('egg_sales')
        .select('trays, total_eggs, sold_on')
        .eq('farm_id', currentFarm.id)
        .gte('sold_on', start)
        .lte('sold_on', end);

      const eggsCollected = (collections || []).reduce((sum: number, c: any) => {
        const trays = Number(c.trays || 0);
        const broken = Number(c.broken || 0);
        const total = Number(c.total_eggs ?? 0);
        if (total > 0) return sum + total;
        return sum + Math.max(0, trays * eggsPerTray - broken);
      }, 0);

      const eggsSold = (sales || []).reduce((sum: number, s: any) => {
        const traysSold = Number(s.trays || 0);
        const total = Number(s.total_eggs ?? 0);
        if (total > 0) return sum + total;
        return sum + traysSold * eggsPerTray;
      }, 0);
      const eggsInStock = eggsCollected - eggsSold;

      const { data: feedStock } = await supabase
        .from('feed_stock')
        .select('bags_in_stock, kg_per_unit')
        .eq('farm_id', currentFarm.id);

      const totalFeedStock = (feedStock || []).reduce(
        (sum, f) => sum + (Number(f.bags_in_stock || 0) * Number(f.kg_per_unit || 0)),
        0
      );

      const { data: feedUsageLogs } = await supabase
        .from('feed_usage_logs')
        .select('quantity_used')
        .eq('farm_id', currentFarm.id)
        .gte('created_at', start)
        .lte('created_at', end);

      const feedUsage = (feedUsageLogs || []).reduce((sum, m) => sum + Number(m.quantity_used || 0), 0);

      const { data: mortality } = await supabase
        .from('mortality_logs')
        .select('count')
        .eq('farm_id', currentFarm.id)
        .gte('event_date', start)
        .lte('event_date', end);

      const totalDeaths = (mortality || []).reduce((sum, m) => sum + (m.count || 0), 0);
      const totalBirds = activeFlocks.reduce((sum, f) => sum + f.current_count, 0);

      const { data: prevMortality } = await supabase
        .from('mortality_logs')
        .select('count')
        .eq('farm_id', currentFarm.id)
        .gte('event_date', new Date(new Date(start).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .lt('event_date', start);

      const prevDeaths = (prevMortality || []).reduce((sum, m) => sum + (m.count || 0), 0);

      const [{ data: eggSales }, { data: birdSales }, { data: expenses }] = await Promise.all([
        supabase.from('egg_sales').select('total_amount').eq('farm_id', currentFarm.id).gte('sale_date', start).lte('sale_date', end),
        supabase.from('bird_sales').select('total_amount').eq('farm_id', currentFarm.id).gte('sale_date', start).lte('sale_date', end),
        supabase.from('expenses').select('amount').eq('farm_id', currentFarm.id).gte('incurred_on', start).lte('incurred_on', end),
      ]);

      const totalRevenue =
        (eggSales?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0) +
        (birdSales?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0);
      const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);

      const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
      const layRate = totalLayerBirds > 0 ? (eggsCollected / (totalLayerBirds * days)) * 100 : 0;

      const { data: prevCollections } = await supabase
        .from('egg_collections')
        .select('trays, broken, total_eggs, collected_on')
        .eq('farm_id', currentFarm.id)
        .gte('collected_on', new Date(new Date(start).getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .lt('collected_on', start);

      const prevEggsCollected = (prevCollections || []).reduce((sum: number, c: any) => {
        const trays = Number(c.trays || 0);
        const broken = Number(c.broken || 0);
        const total = Number(c.total_eggs ?? 0);
        if (total > 0) return sum + total;
        return sum + Math.max(0, trays * eggsPerTray - broken);
      }, 0);
      const prevLayRate = totalLayerBirds > 0 ? (prevEggsCollected / (totalLayerBirds * days)) * 100 : 0;

      // Calculate FCR for broiler flocks
      const fcrResult = await calculateFCRForFarm(currentFarm.id, start, end);

      setKpiData({
        layRate,
        layRateTrend: layRate - prevLayRate,
        eggsCollected,
        eggsSold,
        eggsInStock,
        feedStock: totalFeedStock,
        feedUsage,
        feedPerBird: totalBirds > 0 ? (feedUsage / totalBirds) * 100 : 0,
        mortalityRate: totalBirds > 0 ? (totalDeaths / totalBirds) * 100 : 0,
        mortalityTrend: totalDeaths - prevDeaths,
        profitSnapshot: totalRevenue - totalExpenses,
        fcr: fcrResult.fcr,
        isLayerFarm: fcrResult.isLayerFlock,
        isMixedFarm: fcrResult.isMixedFarm,
        fcrReason: fcrResult.reasonIfNull,
      });
    } catch (error) {
      console.error('Error loading KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl px-0 py-1">
        <div className="text-center text-gray-500">{t('dashboard.loading_kpis')}</div>
      </div>
    );
  }

  if (!kpiData) {
    return (
      <div className="rounded-3xl px-0 py-1">
        <div className="text-center text-gray-500">No data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-0">
      <div className="flex items-center justify-between -mb-0.5">
        <div className="text-sm font-semibold text-gray-900">Core Key Performance Indicators</div>
        <div className="flex gap-1">
          <button
            onClick={() => setPeriod('today')}
            className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors ${
              period === 'today' ? 'bg-neon-400 text-gray-900' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('dashboard.today')}
          </button>
          <button
            onClick={() => setPeriod('week')}
            className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors ${
              period === 'week' ? 'bg-neon-400 text-gray-900' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('dashboard.week')}
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors ${
              period === 'month' ? 'bg-neon-400 text-gray-900' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('dashboard.month')}
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-2 auto-rows-fr ${showEggs && showFCR ? 'sm:grid-cols-4' : showEggs || showFCR ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {showEggs && (
        <div className="bg-gradient-to-br from-neon-50 to-neon-100 rounded-xl p-2.5 h-[118px] border border-neon-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-neon-500 rounded-lg flex items-center justify-center">
              <Egg className="w-3 h-3 text-gray-900" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.lay_rate')}</h3>
          </div>
          <div className="mb-1">
            <span className="text-lg font-bold text-gray-900">{kpiData.layRate.toFixed(1)}%</span>
          </div>
          <p className="text-xs text-gray-600">{t('dashboard.eggs_produced_per_bird')}</p>
        </div>
        )}

        {showEggs && (
        <div className="bg-white/60 rounded-xl p-2.5 h-[118px] border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center">
              <Egg className="w-3 h-3 text-gray-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.eggs')}</h3>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-600">{t('dashboard.collected')}:</span>
              <span className="text-sm font-bold text-gray-900">{kpiData.eggsCollected}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-600">{t('dashboard.sold')}:</span>
              <span className="text-sm font-bold text-gray-900">{kpiData.eggsSold}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1 border-t border-gray-200">
              <span className="text-xs font-medium text-gray-700">{t('dashboard.in_stock')}:</span>
              <span className="text-sm font-bold text-gray-900">{kpiData.eggsInStock}</span>
            </div>
          </div>
        </div>
        )}

        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-2.5 h-[118px] border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-red-600 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-3 h-3 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">{t('dashboard.mortality_rate')}</h3>
          </div>
          <div className="mb-1">
            <span className="text-lg font-bold text-red-600">{kpiData.mortalityRate.toFixed(2)}%</span>
          </div>
          {kpiData.mortalityTrend !== 0 && (
            <p className="text-xs text-gray-600">
              ~ <span className={kpiData.mortalityTrend < 0 ? 'text-green-600' : 'text-red-600'}>{Math.abs(kpiData.mortalityTrend)}</span> {t('dashboard.vs_previous_period')}
            </p>
          )}
          {kpiData.mortalityTrend === 0 && (
            <p className="text-xs text-gray-600">{t('dashboard.vs_previous_period')}</p>
          )}
        </div>

        {showFCR && (
        <div
          className={`rounded-xl p-2.5 h-[118px] border relative ${
            kpiData.isLayerFarm || kpiData.isMixedFarm
              ? 'bg-gray-50 border-gray-200'
              : kpiData.fcr
              ? `bg-gradient-to-br ${getFCRStatus(kpiData.fcr).bgGradient} border-${getFCRStatus(kpiData.fcr).color.split('-')[1]}-200`
              : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                kpiData.isLayerFarm || kpiData.isMixedFarm
                  ? 'bg-gray-300'
                  : kpiData.fcr
                  ? `bg-${getFCRStatus(kpiData.fcr).color.split('-')[1]}-600`
                  : 'bg-gray-300'
              }`}
            >
              <Package className="w-3 h-3 text-white" />
            </div>
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-semibold text-gray-900">FCR</h3>
              <div className="relative">
                <button
                  onMouseEnter={() => setShowFCRTooltip(true)}
                  onMouseLeave={() => setShowFCRTooltip(false)}
                  className="cursor-help"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
                {showFCRTooltip && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                    {kpiData.isLayerFarm
                      ? 'FCR is a broiler metric. Layers are measured by egg production instead.'
                      : kpiData.isMixedFarm
                      ? 'FCR requires feed data per flock. Mixed farms (broilers + layers) share feed logs, so FCR cannot be calculated accurately.'
                      : 'FCR = Feed consumed (kg) / Weight gained (kg)'}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mb-1">
            {kpiData.isLayerFarm || kpiData.isMixedFarm ? (
              <span className="text-lg font-bold text-gray-500">N/A</span>
            ) : kpiData.fcr !== null ? (
              <span className={`text-lg font-bold ${getFCRStatus(kpiData.fcr).color}`}>{kpiData.fcr.toFixed(2)}</span>
            ) : (
              <span className="text-lg font-bold text-gray-500">—</span>
            )}
          </div>
          <p className="text-xs text-gray-600">
            {kpiData.isMixedFarm
              ? 'Mixed farm'
              : kpiData.isLayerFarm
              ? 'Layer farm'
              : kpiData.fcr !== null
              ? getFCRStatus(kpiData.fcr).label
              : kpiData.fcrReason || 'No data'}
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
