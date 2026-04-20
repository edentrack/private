import { useEffect, useState } from 'react';
import { TrendingUp, Download, DollarSign, Activity, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock, Farm } from '../../types/database';
import { FlockSwitcher } from '../common/FlockSwitcher';
import { FlockFinancialSummary } from './FlockFinancialSummary';
import { FarmFinancialSummary } from './FarmFinancialSummary';
import { EggInventory } from '../eggs/EggInventory';
import { EggProductionReports } from '../eggs/EggProductionReports';
import { AdvancedMetrics } from './AdvancedMetrics';
import { ComprehensiveFarmReport } from './ComprehensiveFarmReport';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { CycleCountdownCard } from '../dashboard/CycleCountdownCard';
import { shareViaWhatsApp, formatInsightsForWhatsApp } from '../../utils/whatsappShare';

interface AnalyticsDashboardProps {
  flock: Flock | null;
}

interface KPIData {
  ffcd: number;
  costPerEgg: number;
  costPerBird: number;
  production: number;
  mortality: number;
  profitPerTray: number;
  totalCycleCost: number;
}

export function AnalyticsDashboard({ flock }: AnalyticsDashboardProps) {
  const { t } = useTranslation();
  const { profile, currentFarm, currentRole } = useAuth();
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(flock?.id || null);
  const [currentFlock, setCurrentFlock] = useState<Flock | null>(flock);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [kpis, setKpis] = useState<KPIData>({
    ffcd: 0,
    costPerEgg: 0,
    costPerBird: 0,
    production: 0,
    mortality: 0,
    profitPerTray: 0,
    totalCycleCost: 0,
  });
  const [loading, setLoading] = useState(true);
  const hideFinancials = shouldHideFinancialData(currentRole);

  useEffect(() => {
    loadFarmData();
  }, [currentFarm?.id]);

  useEffect(() => {
    if (selectedFlockId) {
      loadFlockData();
    } else {
      setCurrentFlock(null);
      setLoading(false);
    }
  }, [selectedFlockId]);

  const loadFarmData = async () => {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('farms')
      .select('*')
      .eq('id', currentFarm.id)
      .single();

    if (data) {
      setFarm(data);
    }
  };

  useEffect(() => {
    if (currentFlock) {
      loadAnalytics();
    }
  }, [currentFlock]);

  const loadFlockData = async () => {
    if (!selectedFlockId) return;

    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('id', selectedFlockId)
      .single();

    if (data) {
      setCurrentFlock(data);
    }
  };

  const loadAnalytics = async () => {
    if (!currentFlock) return;

    try {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, category')
        .eq('flock_id', currentFlock.id);

      const { data: mortalityLogs } = await supabase
        .from('mortality_logs')
        .select('count')
        .eq('flock_id', currentFlock.id);

      const totalExpenses = expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
      const totalMortality = mortalityLogs?.reduce((sum, log) => sum + log.count, 0) || 0;
      const feedExpenses = expenses?.filter(e => e.category === 'feed').reduce((sum, e) => sum + e.amount, 0) || 0;

      const mortalityRate = ((totalMortality / currentFlock.initial_count) * 100);
      const survivalRate = 100 - mortalityRate;

      const avgFeedPerBird = currentFlock.current_count > 0 ? feedExpenses / currentFlock.current_count : 0;
      const ffcd = avgFeedPerBird / 50;

      const costPerBird = currentFlock.current_count > 0 ? totalExpenses / currentFlock.initial_count : 0;

      setKpis({
        ffcd: ffcd,
        costPerEgg: 23,
        costPerBird: costPerBird,
        production: survivalRate,
        mortality: mortalityRate,
        profitPerTray: 1520,
        totalCycleCost: totalExpenses,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportData = (format: 'PDF' | 'CSV') => {
    // TODO: Implement PDF/CSV export
  };

  const handleWhatsAppShare = () => {
    if (!currentFlock || !currentFarm) return;

    const totalExpenses = kpis.totalCycleCost;
    const survivalRate = kpis.production.toFixed(1);
    const mortalityRate = kpis.mortality.toFixed(1);
    const totalMortality = Math.round((currentFlock.initial_count * kpis.mortality) / 100);

    const arrivalDate = new Date(currentFlock.arrival_date || currentFlock.start_date);
    const now = new Date();
    const ageDays = Math.max(1, Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24)));
    const ageWeeks = Math.max(1, Math.floor(ageDays / 7) + 1);

    const metrics = {
      totalExpenses,
      totalRevenue: 0,
      netProfit: -totalExpenses,
      profitMargin: '0.0',
      costPerBird: kpis.costPerBird,
      ageWeeks,
      ageDays,
      birdsAlive: currentFlock.current_count,
      initialCount: currentFlock.initial_count,
      totalMortality,
      mortalityRate: mortalityRate,
      survivalRate: survivalRate,
      dailyAvgCost: Math.round(totalExpenses / ageDays),
      feedConversion: kpis.ffcd.toFixed(2),
    };

    const message = formatInsightsForWhatsApp(
      metrics,
      { name: currentFlock.name, type: currentFlock.type || 'Broiler' },
      currentFarm.name || 'My Farm',
      profile?.currency_preference || 'XAF',
      farm?.eggs_per_tray
    );

    shareViaWhatsApp(message);
  };

  const handleFlockChange = (flockId: string | null) => {
    setSelectedFlockId(flockId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
          <p className="text-gray-600">Comprehensive farm analytics and KPIs</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => exportData('PDF')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors inline-flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            PDF
          </button>
          <button
            onClick={() => exportData('CSV')}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors inline-flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </button>
          <button
            onClick={handleWhatsAppShare}
            disabled={!currentFlock}
            className="px-4 py-2 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-xl font-medium transition-colors inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            title="Share via WhatsApp"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp
          </button>
        </div>
      </div>

      {!hideFinancials && <FarmFinancialSummary />}

      <CycleCountdownCard
        selectedFlockId={selectedFlockId}
        onFlockSelect={handleFlockChange}
      />

      <FlockSwitcher
        selectedFlockId={selectedFlockId}
        onFlockChange={handleFlockChange}
        showAllOption={true}
        label="Select Flock for Analytics"
      />

      {!currentFlock ? (
        <>
          {!hideFinancials && <FarmFinancialSummary />}
          <ComprehensiveFarmReport />
          <EggProductionReports flockId={null} />
        </>
      ) : loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">{t('insights.loading_analytics')}</div>
        </div>
      ) : (
        <>
          {!hideFinancials && <FlockFinancialSummary flock={currentFlock} />}

          {farm && currentFlock.type === 'Layer' && (
            <>
              <EggInventory
                flockId={selectedFlockId}
                eggsPerTray={farm.eggs_per_tray || 30}
              />
              <EggProductionReports flockId={selectedFlockId} />
            </>
          )}

          <div className="bg-white rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">KPI Dashboard - {currentFlock.name}</h3>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6">
          <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            FFCD
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {kpis.ffcd.toFixed(2)}
          </div>
          <div className="text-xs text-gray-600">Feed conversion</div>
        </div>

        {!hideFinancials && (
          <>
            <div className="bg-white rounded-2xl p-6">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Cost/Egg
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {kpis.costPerEgg} <span className="text-base">{profile?.currency_preference}</span>
              </div>
              <div className="text-xs text-gray-600">Per egg cost</div>
            </div>

            <div className="bg-white rounded-2xl p-6">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Cost/Bird
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {kpis.costPerBird.toFixed(0)} <span className="text-base">{profile?.currency_preference}</span>
              </div>
              <div className="text-xs text-gray-600">Per bird cost</div>
            </div>
          </>
        )}

        <div className="bg-white rounded-2xl p-6">
          <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            Production
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {kpis.production.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">Survival rate</div>
        </div>

        <div className="bg-white rounded-2xl p-6">
          <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            Mortality
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {kpis.mortality.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">Loss rate</div>
        </div>

        {!hideFinancials && (
          <>
            <div className="bg-white rounded-2xl p-6">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Profit/Tray
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {kpis.profitPerTray} <span className="text-base">{profile?.currency_preference}</span>
              </div>
              <div className="text-xs text-gray-600">Est. profit</div>
            </div>

            <div className="bg-white rounded-2xl p-6 md:col-span-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Total Cycle Cost
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {kpis.totalCycleCost.toLocaleString()} <span className="text-base">{profile?.currency_preference}</span>
              </div>
              <div className="text-xs text-gray-600">Complete cycle expenses</div>
            </div>
          </>
        )}
      </div>
    </div>

    <div className="bg-white rounded-3xl p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2" />
          Performance Summary
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Survival Rate</span>
              <span className="text-sm font-bold text-gray-900">{kpis.production.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-neon-400 h-3 rounded-full transition-all duration-300"
                style={{ width: `${kpis.production}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Mortality Rate</span>
              <span className="text-sm font-bold text-gray-900">{kpis.mortality.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-red-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${kpis.mortality}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <AdvancedMetrics flock={currentFlock} />
        </>
      )}
    </div>
  );
}
