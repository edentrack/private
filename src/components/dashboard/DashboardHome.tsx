import { useEffect, useState, useCallback, useRef } from 'react';
import { DashboardSkeleton } from '../common/Skeleton';
import { Plus, Check, Clock, ArrowRight, TrendingUp, Bird, Users, Package, ArrowUpRight, Play, Pause, DollarSign, Share2, ChevronDown, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useFarmType } from '../../hooks/useFarmType';
import { useToast } from '../../contexts/ToastContext';
import { Flock, Task, Farm } from '../../types/database';
import { LogMortalityModal } from '../mortality/LogMortalityModal';
import { CompleteTaskModal } from '../tasks/CompleteTaskModal';
import { FlockSwitcher } from '../common/FlockSwitcher';
import { CoreKPISection } from '../analytics/CoreKPISection';
import { DailySummaryCard } from './DailySummaryCard';
import { ProductionCycleWidget } from './ProductionCycleWidget';
import { TodayTasksWidget } from './TodayTasksWidget';
import { UnifiedTaskSettings } from '../tasks/UnifiedTaskSettings';
import { InventoryUsageWidget } from './InventoryUsageWidget';
import { QuickEggCollectionWidget } from './QuickEggCollectionWidget';
import { WeatherWidget } from './WeatherWidget';
import { hasFeatureAccess } from '../../utils/planGating';
import { canViewAnalytics } from '../../utils/permissions';
import { getTaskTimeStatus, formatTaskDueTime } from '../../utils/taskPermissions';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { usePermissions } from '../../contexts/PermissionsContext';
import { shareViaWhatsApp } from '../../utils/whatsappShare';
import { getFarmTimeZone, getFarmTodayISO } from '../../utils/farmTime';

interface DashboardHomeProps {
  onNavigate: (view: string) => void;
  onSelectFlock: (flock: Flock) => void;
}

export function DashboardHome({ onNavigate, onSelectFlock }: DashboardHomeProps) {
  const { t } = useTranslation();
  const { user, profile, currentFarm, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const { showEggs, showFCR, farmType } = useFarmType();
  const toast = useToast();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMortalityModal, setShowMortalityModal] = useState(false);
  const [mortalityFlock, setMortalityFlock] = useState<Flock | null>(null);
  const [showTaskSettingsModal, setShowTaskSettingsModal] = useState(false);
  const [showCompleteTaskModal, setShowCompleteTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [stats, setStats] = useState({ totalBirds: 0, totalFlocks: 0, pendingTasks: 0 });
  const [salesStats, setSalesStats] = useState({ birdsSold: 0, totalRevenue: 0, remaining: 0 });
  const [refreshTasks, setRefreshTasks] = useState(0);
  const [eggRefreshTrigger, setEggRefreshTrigger] = useState(0);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [spikeAlerts, setSpikeAlerts] = useState<any[]>([]);
  const [todayEggs, setTodayEggs] = useState<any[]>([]);
  const [todayMortality, setTodayMortality] = useState<any[]>([]);
  const [feedStock, setFeedStock] = useState<any[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    mainTasks: true,
    quickActions: false,
  });
  const hideFinancials = shouldHideFinancialData(currentRole, farmPermissions);
  // Ref so loadDashboardData can read currentFarm without being recreated on every object change
  const currentFarmRef = useRef(currentFarm);
  useEffect(() => { currentFarmRef.current = currentFarm; }, [currentFarm]);

  const [farmSettings, setFarmSettings] = useState<{
    broilerDuration?: number;
    layerDuration?: number;
    broilerPhases?: Array<{ name: string; startWeek: number; endWeek: number; feedType: string }>;
    layerPhases?: Array<{ name: string; startWeek: number; endWeek: number; feedType: string }>;
  } | null>(null);

  const loadDashboardData = useCallback(async (isInitialLoad = false) => {
    const farm = currentFarmRef.current;
    if (!farm?.id) {
      setLoading(false);
      return;
    }

    // Only show the loading spinner on first load — subsequent refreshes update silently
    if (isInitialLoad) setLoading(true);

    try {
      const { data: farmData } = await supabase
        .from('farms')
        .select('*')
        .eq('id', farm.id)
        .single();

      if (farmData) {
        setFarm(farmData);
      }

      const { data: flocksData } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', farm.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (flocksData && flocksData.length > 0) {
        setFlocks(flocksData);
        setSelectedFlockId(prev => prev || flocksData[0].id);
        const totalBirds = flocksData.reduce((sum, f) => sum + (f.current_count || 0), 0);
        setStats(prev => ({ ...prev, totalBirds, totalFlocks: flocksData.length }));
      } else {
        setFlocks([]);
        setStats(prev => ({ ...prev, totalBirds: 0, totalFlocks: 0 }));
      }

      const farmTz = getFarmTimeZone(farm);
      const today = getFarmTodayISO(farmTz);

      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*, task_templates(title, category)')
        .eq('farm_id', farm.id)
        .eq('status', 'pending')
        .eq('is_archived', false)
        .or(`due_date.eq.${today},due_date.lt.${today}`)
        .order('due_date', { ascending: true })
        .order('scheduled_time', { ascending: true })
        .limit(8);

      const { count: totalTasksCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('farm_id', farm.id)
        .eq('status', 'pending')
        .eq('is_archived', false)
        .or(`due_date.eq.${today},due_date.lt.${today}`);

      setTasks(tasksData || []);
      setStats(prev => ({ ...prev, pendingTasks: totalTasksCount || 0 }));

      // Preload report data in background so share button works synchronously
      const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().split('T')[0];
      const [eggsRes, mortalityRes, feedRes] = await Promise.allSettled([
        supabase.from('egg_collections').select('*').eq('farm_id', farm.id).gte('collected_on', today).lt('collected_on', tomorrow),
        supabase.from('mortality_logs').select('*').eq('farm_id', farm.id).gte('event_date', today).lt('event_date', tomorrow),
        supabase.from('feed_stock').select('*').eq('farm_id', farm.id).order('feed_type'),
      ]);
      setTodayEggs(eggsRes.status === 'fulfilled' ? (eggsRes.value.data || []) : []);
      setTodayMortality(mortalityRes.status === 'fulfilled' ? (mortalityRes.value.data || []) : []);
      setFeedStock(feedRes.status === 'fulfilled' ? (feedRes.value.data || []) : []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, []); // stable — reads currentFarm via ref

  useEffect(() => {
    if (user && currentFarm?.id) {
      loadDashboardData(true); // initial load — show spinner
    }
  }, [user, currentFarm?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull-to-refresh: re-fetch silently when the global event fires
  useEffect(() => {
    const handler = () => loadDashboardData();
    window.addEventListener('edentrack:refresh', handler);
    return () => window.removeEventListener('edentrack:refresh', handler);
  }, [loadDashboardData]);

  useEffect(() => {
    if (currentFarm?.id) {
      loadFarmSettings();
    }
  }, [currentFarm?.id]);

  useEffect(() => {
    if (!currentFarm?.id) return;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('mortality_spike_alerts')
      .select('*')
      .eq('farm_id', currentFarm.id)
      .eq('alert_date', today)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => setSpikeAlerts(data || []));
  }, [currentFarm?.id]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.good_morning');
    if (hour < 18) return t('dashboard.good_afternoon');
    return t('dashboard.good_evening');
  };

  // Synchronous — uses only pre-loaded state so window.open isn't blocked by browser
  const handleShareReport = () => {
    if (!currentFarm) {
      toast.error('No farm selected');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lines: string[] = [];

    lines.push(`📋 *DAILY OPERATIONS REPORT*`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🏢 *Farm:* ${currentFarm.name}`);
    lines.push(`📅 *Date:* ${dateStr}`);
    lines.push('');

    // Flocks
    if (flocks.length > 0) {
      lines.push(`🐔 *FLOCKS (${flocks.length} active)*`);
      flocks.forEach(f => {
        lines.push(`• ${f.name}: ${(f.current_count ?? 0).toLocaleString()} birds (${f.type ?? 'Unknown'})`);
      });
      lines.push('');
    }

    // Eggs — loaded in background by loadDashboardData
    if (todayEggs.length > 0) {
      const totalGood = todayEggs.reduce((s, e) => s + (Number(e.total_eggs) || 0), 0);
      const totalDmg = todayEggs.reduce((s, e) => s + (Number(e.damaged_eggs) || 0), 0);
      lines.push(`🥚 *EGGS COLLECTED TODAY*`);
      lines.push(`• Good eggs: *${totalGood.toLocaleString()}*`);
      if (totalDmg > 0) lines.push(`• Damaged: ${totalDmg}`);
      todayEggs.forEach(e => {
        const flock = flocks.find(f => f.id === e.flock_id);
        if (flock && todayEggs.length > 1) lines.push(`  → ${flock.name}: ${Number(e.total_eggs) || 0} eggs`);
      });
      lines.push('');
    } else {
      lines.push(`🥚 *EGGS:* No collections recorded today`);
      lines.push('');
    }

    // Mortality
    if (todayMortality.length > 0) {
      const totalDeaths = todayMortality.reduce((s, m) => s + (Number(m.count) || 0), 0);
      lines.push(`⚠️ *MORTALITY TODAY: ${totalDeaths} birds*`);
      todayMortality.forEach(m => {
        const flock = flocks.find(f => f.id === m.flock_id);
        const cause = m.cause ? ` — ${m.cause}` : '';
        lines.push(`• ${flock?.name ?? 'Unknown flock'}: ${Number(m.count) || 0} birds${cause}`);
      });
      lines.push('');
    } else {
      lines.push(`✅ *MORTALITY:* 0 deaths today`);
      lines.push('');
    }

    // Tasks (pending ones already in state)
    if (tasks.length > 0) {
      lines.push(`📋 *PENDING TASKS (${stats.pendingTasks})*`);
      tasks.slice(0, 5).forEach(t => {
        const title = t.title_override || (t.task_templates as any)?.title || 'Task';
        lines.push(`✗ ${title}`);
      });
      lines.push('');
    } else {
      lines.push(`✅ *TASKS:* All done for today`);
      lines.push('');
    }

    // Feed stock
    if (feedStock.length > 0) {
      lines.push(`🌾 *FEED INVENTORY*`);
      feedStock.forEach(f => {
        const stock = Number(f.current_stock_bags) || 0;
        const lowFlag = stock < 5 ? ' ⚠️ LOW' : '';
        lines.push(`• ${f.feed_type}: ${stock} bags${lowFlag}`);
      });
      lines.push('');
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Sent via Edentrack`);
    lines.push(new Date().toLocaleTimeString());

    shareViaWhatsApp(lines.join('\n'));
  };

  const handleLogMortality = (flock: Flock) => {
    setMortalityFlock(flock);
    setShowMortalityModal(true);
  };

  const selectedFlock = flocks.find(f => f.id === selectedFlockId);

  const getTaskTitle = (task: Task): string => {
    return task.title_override || task.task_templates?.title || 'Task';
  };

  const isTaskCompleted = (task: Task): boolean => {
    return task.status === 'completed';
  };

  const loadFarmSettings = async () => {
    if (!currentFarm?.id) return;

    const defaultSettings = {
      broilerDuration: 8,
      layerDuration: 72,
      broilerPhases: [],
      layerPhases: [],
    };

    try {
      const { data: farmData, error } = await supabase
        .from('farms')
        .select('broiler_total_duration_weeks, layer_total_duration_weeks, broiler_phases, layer_phases')
        .eq('id', currentFarm.id)
        .single();

      if (error) {
        // If columns don't exist (migration not run), use defaults
        if (error.code === 'PGRST116' || error.message?.includes('column') || error.message?.includes('schema cache')) {
          setFarmSettings(defaultSettings);
          return;
        }
        setFarmSettings(defaultSettings);
        return;
      }

      if (farmData) {
        setFarmSettings({
          broilerDuration: farmData.broiler_total_duration_weeks ?? 8,
          layerDuration: farmData.layer_total_duration_weeks ?? 72,
          broilerPhases: farmData.broiler_phases || [],
          layerPhases: farmData.layer_phases || [],
        });
      } else {
        setFarmSettings(defaultSettings);
      }
    } catch (error: any) {
      console.error('Error loading farm settings in DashboardHome:', error);
      setFarmSettings({
        broilerDuration: 8,
        layerDuration: 72,
      });
    }
  };

  const getFlockAge = (arrivalDate: string) => {
    const arrival = new Date(arrivalDate);
    const now = new Date();
    const diffTime = now.getTime() - arrival.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(diffDays / 7) + 1;
    const days = diffDays % 7;
    return { weeks, days };
  };

  const getFlockTargetWeeks = (flock: Flock | null): number => {
    if (!flock) return 72;
    const isBroiler = flock.type?.toLowerCase() === 'broiler';
    return isBroiler 
      ? (farmSettings?.broilerDuration ?? 8)
      : (farmSettings?.layerDuration ?? 72);
  };

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (flocks.length === 0) {
    const isWorker = currentRole?.toLowerCase() === 'worker' || currentRole?.toLowerCase() === 'viewer';
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-32 h-32 mx-auto mb-8 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-neon-300/50 to-neon-500/30 rounded-full blur-2xl" />
            <img src="/image.png" alt="Layer Hen" className="relative w-full h-full object-contain" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">{t('dashboard.welcome_to_farm')}</h3>
          {isWorker ? (
            <p className="text-gray-500 text-sm">{t('dashboard.no_flocks_yet_worker') || 'No flocks set up yet. Your manager will add flocks when ready. Check back soon!'}</p>
          ) : (
            <>
              <p className="text-gray-500 mb-8 text-sm">{t('dashboard.create_first_flock_desc') || 'Create your first flock to start tracking daily operations, expenses, sales, and bird health.'}</p>
              <button
                onClick={() => onNavigate('flocks')}
                className="btn-neon inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                {t('flocks.create_flock')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const dismissAlert = async (id: string) => {
    setSpikeAlerts(prev => prev.filter(a => a.id !== id));
    await supabase.from('mortality_spike_alerts').update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq('id', id);
  };

  return (
    <div className="space-y-3 md:space-y-5">
      {/* Mortality spike alert banners */}
      {spikeAlerts.map(alert => (
        <div key={alert.id} className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-800 text-sm">
              ⚠️ Mortality spike in {alert.flock_name} — {alert.today_deaths} deaths today ({alert.spike_ratio?.toFixed(1)}× above normal)
            </p>
            <p className="text-red-700 text-xs mt-1">
              Likely causes: {alert.likely_causes?.join(', ')}. Isolate affected birds and check water/feed immediately.
            </p>
          </div>
          <button onClick={() => dismissAlert(alert.id)} className="text-red-400 hover:text-red-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="animate-fade-in-up flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-1">
            {getGreeting()}, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-gray-500">{t('dashboard.farm_overview')}</p>
        </div>

        <button
          onClick={handleShareReport}
          disabled={generatingReport}
          className="shrink-0 px-3 sm:px-4 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
        >
          {generatingReport ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span className="hidden sm:inline">{t('dashboard.generating')}</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('dashboard.share_daily_report')}</span>
            </>
          )}
        </button>
      </div>

      <WeatherWidget
        fallbackLocation={
          farm?.city
            ? `${farm.city}${farm.region_state ? ', ' + farm.region_state : ''}, ${farm.country}`
            : farm?.country
        }
        onOpenSettings={() => onNavigate('settings')}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 animate-fade-in-up stagger-1">
        <div className="flex items-center gap-3">
          <div className="stat-label">{t('dashboard.total_birds')}</div>
          <div className="text-xl sm:text-4xl font-bold text-gray-900">{stats.totalBirds.toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="stat-label">{t('dashboard.active_flocks')}</div>
          <div className="text-xl sm:text-4xl font-bold text-gray-900">{stats.totalFlocks}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="stat-label">{t('dashboard.pending_tasks')}</div>
          <div className="text-xl sm:text-4xl font-bold text-gray-900">{stats.pendingTasks}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="stat-label">{t('dashboard.current_week')}</div>
          <div className="text-xl sm:text-4xl font-bold text-gray-900">
            {selectedFlock ? (() => {
              const age = getFlockAge(selectedFlock.arrival_date);
              return (
                <>
                  {age.weeks}
                  {age.days > 0 && <span className="text-xl font-normal text-gray-400 ml-1.5">{age.days}d</span>}
                </>
              );
            })() : '-'}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6 py-4 animate-fade-in-up stagger-2">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">{t('dashboard.progress')}</span>
            <span className="text-sm font-medium text-gray-700">
              {selectedFlock ? (() => {
                const age = getFlockAge(selectedFlock.arrival_date);
                return (
                  <>
                    {t('dashboard.week_label', { week: age.weeks })}
                    {age.days > 0 && <span className="text-gray-400 ml-1">{age.days}d</span>}
                  </>
                );
              })() : t('dashboard.select_flock')}
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            {selectedFlock && farmSettings ? (() => {
              const { weeks: currentWeek } = getFlockAge(selectedFlock.arrival_date);
              const targetWeeks = getFlockTargetWeeks(selectedFlock);
              const progressPercent = Math.min((currentWeek / targetWeeks) * 100, 100);
              return (
                <div
                  className="h-full bg-gradient-to-r from-neon-400 to-neon-500 rounded-full transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              );
            })() : (
              <div className="h-full bg-gray-200 rounded-full" style={{ width: '0%' }} />
            )}
          </div>
          {selectedFlock && farmSettings ? (() => {
            const { weeks: currentWeek } = getFlockAge(selectedFlock.arrival_date);
            const targetWeeks = getFlockTargetWeeks(selectedFlock);
            const progressPercent = targetWeeks > 0 ? Math.min((currentWeek / targetWeeks) * 100, 100) : 0;
            
            // Determine current phase for short description
            const isBroiler = selectedFlock.type?.toLowerCase() === 'broiler';
            const DEFAULT_BROILER_PHASES = [
              { name: 'Brooding', startWeek: 1, endWeek: 2 },
              { name: 'Growth', startWeek: 3, endWeek: 4 },
              { name: 'Finishing', startWeek: 5, endWeek: 8 },
            ];
            const DEFAULT_LAYER_PHASES = [
              { name: 'Chick', startWeek: 1, endWeek: 5 },
              { name: 'Grower', startWeek: 6, endWeek: 12 },
              { name: 'Pullet', startWeek: 13, endWeek: 17 },
              { name: 'Pre-lay', startWeek: 18, endWeek: 20 },
              { name: 'Laying', startWeek: 21, endWeek: 72 },
            ];
            
            // Use farm settings phases if available, otherwise use defaults
            const phases = isBroiler
              ? (farmSettings.broilerPhases && farmSettings.broilerPhases.length > 0
                  ? farmSettings.broilerPhases
                  : DEFAULT_BROILER_PHASES)
              : (farmSettings.layerPhases && farmSettings.layerPhases.length > 0
                  ? farmSettings.layerPhases
                  : DEFAULT_LAYER_PHASES);
            const currentPhase = phases.find(p => currentWeek >= p.startWeek && currentWeek <= p.endWeek);
            
            return (
              <p className="text-xs text-gray-500 mt-1">
                {t('production_cycle.cycle_progress', { 
                  percent: progressPercent.toFixed(1), 
                  currentWeek: currentWeek.toString(), 
                  targetWeek: targetWeeks.toString() 
                })}
                {currentPhase ? ` • ${currentPhase.name} ${t('production_cycle.phase')}` : ''}
              </p>
            );
          })() : null}
        </div>
        <div className="w-full lg:w-auto">
          <FlockSwitcher
            selectedFlockId={selectedFlockId}
            onFlockChange={setSelectedFlockId}
            showAllOption={false}
            label=""
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3 md:gap-4">
        <div className="lg:col-span-1 space-y-3 md:space-y-4">
          <div className="animate-fade-in-up stagger-3">
            <div>
              <button
                type="button"
                onClick={() => toggleSection('mainTasks')}
                className="w-full flex items-center justify-start gap-1.5 px-1 py-1 text-left"
              >
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.mainTasks ? 'rotate-180' : ''}`} />
                <span className="text-sm font-semibold text-gray-900">Main Tasks</span>
              </button>
              {expandedSections.mainTasks && (
                <div className="pt-1">
                  <TodayTasksWidget
                    key={refreshTasks}
                    onAddTask={() => setShowTaskSettingsModal(true)}
                    selectedFlockId={selectedFlockId}
                  />
                </div>
              )}
            </div>
          </div>
          {showEggs && (
            <div className="animate-fade-in-up stagger-4">
              <div>
                <div className="px-1 py-0.5 text-sm font-semibold text-gray-900">Egg Quick Entry</div>
                <QuickEggCollectionWidget onSuccess={() => setEggRefreshTrigger((t) => t + 1)} />
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-3 md:space-y-4">
          {selectedFlock && (
            <div className="animate-fade-in-up stagger-4">
              <ProductionCycleWidget flock={selectedFlock} onNavigate={onNavigate} />
            </div>
          )}
        </div>
      </div>


      {currentRole && farm && canViewAnalytics(currentRole as any) && hasFeatureAccess(farm.plan, 'kpis') && (
        <div data-tour="kpi-section">
          <CoreKPISection refreshTrigger={eggRefreshTrigger} />
        </div>
      )}

      {currentRole && farm && canViewAnalytics(currentRole as any) && hasFeatureAccess(farm.plan, 'daily_summary') && (
        <div>
          <DailySummaryCard refreshTrigger={eggRefreshTrigger} />
        </div>
      )}

      <div className="animate-fade-in-up">
        <div className="px-1 py-0.5 text-sm font-semibold text-gray-900">Inventory Usage</div>
        <InventoryUsageWidget />
      </div>

      {currentRole?.toLowerCase() !== 'worker' && currentRole?.toLowerCase() !== 'viewer' && (
        <div className="animate-fade-in-up bg-white border border-gray-100 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('quickActions')}
            className="w-full flex items-center justify-start gap-1.5 px-3 py-2 text-left hover:bg-gray-50"
          >
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedSections.quickActions ? 'rotate-180' : ''}`} />
            <span className="text-sm font-semibold text-gray-900">Quick Actions</span>
          </button>
          {expandedSections.quickActions && (
            <div className="p-2 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => onNavigate('sales')}
                className="group text-left border border-green-200 bg-gradient-to-br from-green-50 to-white rounded-lg p-2.5 hover:shadow transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-600 text-xs mb-0.5">{t('dashboard.sales')}</p>
                    <p className="text-sm font-semibold text-gray-900">{t('dashboard.record_sale')}</p>
                  </div>
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-500 transition-colors">
                    <DollarSign className="w-4 h-4 text-green-600 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('inventory')}
                className="group text-left border border-gray-200 bg-white rounded-lg p-2.5 hover:shadow transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">{t('dashboard.inventory')}</p>
                    <p className="text-sm font-semibold text-gray-900">{t('dashboard.manage_stock')}</p>
                  </div>
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-neon-500/20 transition-colors">
                    <Package className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('weight')}
                className="group text-left border border-gray-200 bg-white rounded-lg p-2.5 hover:shadow transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs mb-0.5">Weight</p>
                    <p className="text-sm font-semibold text-gray-900">Quick Weight Check</p>
                  </div>
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-neon-500/20 transition-colors">
                    <TrendingUp className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
              </button>
            </div>
            </div>
          )}
        </div>
      )}

      {showMortalityModal && (
        <LogMortalityModal
          flock={mortalityFlock}
          onClose={() => setShowMortalityModal(false)}
          onLogged={loadDashboardData}
        />
      )}

      {showTaskSettingsModal && (
        <UnifiedTaskSettings
          onClose={() => {
            setShowTaskSettingsModal(false);
            setRefreshTasks(prev => prev + 1);
            loadDashboardData();
          }}
        />
      )}

      {showCompleteTaskModal && selectedTask && (
        <CompleteTaskModal
          task={selectedTask}
          onClose={() => {
            setShowCompleteTaskModal(false);
            setSelectedTask(null);
          }}
          onSuccess={() => {
            setShowCompleteTaskModal(false);
            setSelectedTask(null);
            loadDashboardData();
          }}
        />
      )}

      
    </div>
  );
}
