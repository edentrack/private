import { useState, useEffect } from 'react';
import { RefreshCw, Check, Circle, ArrowRight, Scale, Egg, AlertCircle, Zap, Rabbit as RabbitIcon } from 'lucide-react';
import { Flock } from '../../types/database';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { getFlockAgeDays } from '../../utils/flockAge';
import { RABBIT_DEFAULT_PHASES } from '../../utils/speciesModules';
import { calculateKindlingRate, formatKindlingRate } from '../../utils/kindlingRate';
import { calculateRabbitFCR, formatRabbitFCR } from '../../utils/fcrRabbits';

interface ProductionCycleWidgetProps {
  flock: Flock | null;
  onNavigate?: (view: string) => void;
}

interface Milestone {
  week: number;
  label: string;
  completed: boolean;
  current: boolean;
}

interface WeightData {
  averageWeight: number | null;
  date: string | null;
  isOverdue: boolean;
  weekNumber: number;
}

export function ProductionCycleWidget({ flock, onNavigate }: ProductionCycleWidgetProps) {
  const { currentFarm } = useAuth();
  const { t } = useTranslation();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('');
  const [feedType, setFeedType] = useState('');
  const [targetWeek, setTargetWeek] = useState(72); // Default to layer duration
  const [currentPhaseData, setCurrentPhaseData] = useState<{ startWeek: number; endWeek: number; name: string; feedType: string } | null>(null);
  const [nextPhaseData, setNextPhaseData] = useState<{ name: string; feedType: string } | null>(null);
  const [weightData, setWeightData] = useState<WeightData>({
    averageWeight: null,
    date: null,
    isOverdue: false,
    weekNumber: 0,
  });
  const [farmSettings, setFarmSettings] = useState<{
    broilerDuration?: number;
    layerDuration?: number;
    broilerPhases?: Array<{ name: string; startWeek: number; endWeek: number; feedType: string }>;
    layerPhases?: Array<{ name: string; startWeek: number; endWeek: number; feedType: string }>;
  } | null>(null);

  // Rabbit-specific metrics — only populated for rabbit farms.
  const [rabbitMetrics, setRabbitMetrics] = useState<{
    kindlingRate: ReturnType<typeof calculateKindlingRate> | null;
    fcr: ReturnType<typeof calculateRabbitFCR> | null;
  }>({ kindlingRate: null, fcr: null });

  useEffect(() => {
    if (flock && currentFarm?.id) {
      loadFarmSettings();
      loadRabbitMetrics();
    }
  }, [flock, currentFarm?.id]);

  useEffect(() => {
    if (flock) {
      // Always calculate, even if farmSettings is null (will use defaults)
      calculateCycle();
      fetchWeightData();
    }
  }, [flock, farmSettings]);

  // Re-calculate phase when user returns to the app (handles tab left open across days/weeks)
  useEffect(() => {
    if (!flock) return;
    const onVisible = () => { if (document.visibilityState === 'visible') calculateCycle(); };
    const onFocus = () => calculateCycle();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [flock, farmSettings]);

  useEffect(() => {
    if (!flock || flock.type?.toLowerCase() !== 'broiler') return;

    const subscription = supabase
      .channel(`weight_logs_${flock.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weight_logs',
          filter: `flock_id=eq.${flock.id}`,
        },
        () => {
          fetchWeightData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [flock]);

  const loadFarmSettings = async () => {
    // Always set defaults first so calculateCycle can run
    const defaultSettings = {
      broilerDuration: 8,
      layerDuration: 72,
      broilerPhases: [],
      layerPhases: [],
    };

    if (!flock || !currentFarm?.id) {
      setFarmSettings(defaultSettings);
      return;
    }

    try {
      const { data: farmData, error } = await supabase
        .from('farms')
        .select('broiler_total_duration_weeks, layer_total_duration_weeks, broiler_phases, layer_phases')
        .eq('id', currentFarm.id)
        .single();

      if (error) {
        // If columns don't exist (migration not run), use defaults gracefully
        if (error.code === 'PGRST116' || error.message?.includes('column') || error.message?.includes('schema cache')) {
          setFarmSettings(defaultSettings);
          return;
        }
        throw error;
      }

      if (farmData) {
        const settings = {
          broilerDuration: farmData.broiler_total_duration_weeks ?? 8,
          layerDuration: farmData.layer_total_duration_weeks ?? 72,
          broilerPhases: farmData.broiler_phases || [],
          layerPhases: farmData.layer_phases || [],
        };
        setFarmSettings(settings);
      } else {
        setFarmSettings(defaultSettings);
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.warn('ProductionCycleWidget - Error loading farm settings:', error?.message);
      }
      setFarmSettings(defaultSettings);
    }
  };

  const calculateCycle = () => {
    if (!flock) return;

    // Honour age_at_arrival_days — handles point-of-lay pullets,
    // older growers, and retroactive tracking.
    const week = Math.max(1, Math.floor(getFlockAgeDays(flock) / 7) + 1);
    setCurrentWeek(week);

    const isBroiler = flock.type?.toLowerCase() === 'broiler';
    const isRabbit = (flock as any).species === 'rabbits'
      || (flock.type as string) === 'Meat Rabbits' || (flock.type as string) === 'Breeder Rabbits';

    // Target weeks per species. Rabbits market-ready around 16 weeks.
    let target: number;
    if (isRabbit) {
      target = 16;
    } else if (isBroiler) {
      target = farmSettings?.broilerDuration ?? 8;
    } else {
      target = farmSettings?.layerDuration ?? 72;
    }
    const validTarget = target && target > 0 ? target : (isRabbit ? 16 : isBroiler ? 8 : 72);
    setTargetWeek(validTarget);

    if (isRabbit) {
      setRabbitMilestones(week);
    } else if (isBroiler) {
      setBroilerMilestones(week);
    } else {
      setLayerMilestones(week);
    }
  };

  /**
   * Phase C wire-up: pull rabbit-specific metrics for the dashboard pills.
   * - Kindling rate: from `litters` table — kits weaned in the last 90 days
   *   over active does count.
   * - Rabbit FCR: feed_usage_logs share + crude liveweight estimate from
   *   current_count × est. avg weight.
   * Both fail-soft if the table/data isn't available.
   */
  const loadRabbitMetrics = async () => {
    if (!flock || !currentFarm?.id) return;
    const isRabbit =
      (flock as any).species === 'rabbits' ||
      (flock.type as string) === 'Meat Rabbits' ||
      (flock.type as string) === 'Breeder Rabbits';
    if (!isRabbit) {
      setRabbitMetrics({ kindlingRate: null, fcr: null });
      return;
    }

    // Kindling rate over 90-day window
    const periodDays = 90;
    const since = new Date(Date.now() - periodDays * 86_400_000).toISOString().split('T')[0];

    let kindlingRate: ReturnType<typeof calculateKindlingRate> | null = null;
    try {
      // Litters table: count weaned kits in window for this farm
      const { data: litters } = await supabase
        .from('litters')
        .select('weaned_count, weaned_on, kindled_on')
        .eq('farm_id', currentFarm.id)
        .gte('weaned_on', since);
      const weanedKits = (litters || []).reduce((sum, l: any) => sum + (Number(l.weaned_count) || 0), 0);

      // Active does = rabbits in registry table (or breeder-type flocks)
      const { data: activeDoesRows } = await supabase
        .from('rabbits_registry')
        .select('id', { count: 'exact', head: true })
        .eq('farm_id', currentFarm.id)
        .eq('sex', 'female')
        .eq('status', 'active');
      const activeDoes = (activeDoesRows as any)?.count ?? 0;

      if (activeDoes > 0) {
        kindlingRate = calculateKindlingRate({ weanedKits, periodDays, activeDoes });
      }
    } catch {
      // Litters or registry table not yet available — silently skip
      kindlingRate = null;
    }

    // Rabbit FCR — coarse estimate.
    let fcr: ReturnType<typeof calculateRabbitFCR> | null = null;
    try {
      const startDate = String(flock.arrival_date).split('T')[0];

      // Feed for this farm in window, attributed to this flock by share.
      const { data: rabbitFlocks } = await supabase
        .from('flocks')
        .select('id, current_count, type')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .in('type', ['Meat Rabbits', 'Breeder Rabbits']);
      const rabbitTotalCount = (rabbitFlocks || []).reduce(
        (s, f) => s + (Number(f.current_count) || 0),
        0,
      );
      const ourShare = rabbitTotalCount > 0 ? (flock.current_count || 0) / rabbitTotalCount : 0;

      const { data: feedLogs } = await supabase
        .from('feed_usage_logs')
        .select('quantity_used')
        .eq('farm_id', currentFarm.id)
        .gte('created_at', `${startDate}T00:00:00`);
      const totalFarmFeedKg = (feedLogs || []).reduce((s, l: any) => s + (Number(l.quantity_used) || 0), 0);
      const myFeedKg = totalFarmFeedKg * ourShare;

      // Liveweight gained: assume 0.05 kg starting (kit at week 5) → current avg
      // (use 2.0 kg as fallback if no weight data). Coarse but better than nothing.
      const currentCount = flock.current_count || 0;
      const initialAvgKg = 0.7; // typical weanling weight
      const currentAvgKg = 2.0; // fallback grow-out target
      const liveweightGainedKg = Math.max(0, (currentAvgKg - initialAvgKg) * currentCount);

      fcr = calculateRabbitFCR({
        feedKg: myFeedKg,
        liveweightGainedKg,
        rabbitType: (flock.type as 'Meat Rabbits' | 'Breeder Rabbits') ?? 'Meat Rabbits',
      });
    } catch {
      fcr = null;
    }

    setRabbitMetrics({ kindlingRate, fcr });
  };

  // Rabbit milestones: Kit / Weanling / Grower / Market-ready.
  // No farm-settings override yet — rabbit phase customisation is a follow-up.
  const setRabbitMilestones = (week: number) => {
    const phases = RABBIT_DEFAULT_PHASES;
    const rabbitMilestones: Milestone[] = phases.map(phase => ({
      week: phase.startWeek,
      label: phase.name,
      completed: week > phase.endWeek,
      current: week >= phase.startWeek && week <= phase.endWeek,
    }));
    setMilestones(rabbitMilestones);

    const foundPhase = phases.find(p => week >= p.startWeek && week <= p.endWeek);
    if (foundPhase) {
      setCurrentPhase(foundPhase.name);
      setFeedType('—');
      setCurrentPhaseData({ ...foundPhase, feedType: '—' });
    } else {
      setCurrentPhase('Market-ready');
      setFeedType('—');
      setCurrentPhaseData(null);
    }
    setNextPhaseData(null);
  };

  // Calculate phase progress whenever currentPhaseData or currentWeek changes
  useEffect(() => {
    if (!currentPhaseData || currentWeek === 0) {
      setProgress(0);
      return;
    }

    const phaseStartWeek = currentPhaseData.startWeek;
    const phaseEndWeek = currentPhaseData.endWeek;
    const phaseDuration = phaseEndWeek - phaseStartWeek + 1;
    const weeksIntoPhase = currentWeek - phaseStartWeek + 1;
    
    const phaseProgress = Math.min((weeksIntoPhase / phaseDuration) * 100, 100);
    setProgress(phaseProgress);
  }, [currentPhaseData, currentWeek]);

  const fetchWeightData = async () => {
    if (!flock || flock.type?.toLowerCase() !== 'broiler') return;

    // Use the age helper so age_at_arrival_days is respected. The weight-log
    // date range is "the past 7 days from today" rather than "week N from
    // arrival" — this avoids breaking when age_at_arrival_days > 0 (the old
    // formula would compute a date far in the future).
    const ageDays = getFlockAgeDays(flock);
    const week = Math.max(1, Math.floor(ageDays / 7) + 1);
    const now = new Date();
    const weekEndDate = new Date(now);
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - 6);

    const { data: weightLogs } = await supabase
      .from('weight_logs')
      .select('average_weight, date')
      .eq('farm_id', currentFarm!.id)
      .eq('flock_id', flock.id)
      .gte('date', weekStartDate.toISOString().split('T')[0])
      .lte('date', weekEndDate.toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(1);

    const hasWeight = weightLogs && weightLogs.length > 0;
    const isWeekComplete = now > weekEndDate;

    setWeightData({
      averageWeight: hasWeight ? weightLogs[0].average_weight : null,
      date: hasWeight ? weightLogs[0].date : null,
      isOverdue: !hasWeight && isWeekComplete,
      weekNumber: week,
    });
  };

  const setBroilerMilestones = (week: number) => {
    // Default phases matching the original milestones
    const DEFAULT_BROILER_PHASES = [
      { name: 'Brooding', startWeek: 1, endWeek: 2, feedType: 'Starter' },
      { name: 'Growth', startWeek: 3, endWeek: 4, feedType: 'Grower' },
      { name: 'Finishing', startWeek: 5, endWeek: 8, feedType: 'Finisher' },
    ];

    // Use configured phases if available, otherwise use defaults
    const phases = farmSettings?.broilerPhases && farmSettings.broilerPhases.length > 0
      ? farmSettings.broilerPhases
      : DEFAULT_BROILER_PHASES;

    const broilerMilestones: Milestone[] = phases.map(phase => ({
      week: phase.startWeek,
      label: `${phase.name} - ${phase.feedType}`,
      completed: week > phase.endWeek,
      current: week >= phase.startWeek && week <= phase.endWeek,
    }));

    // Add final milestone if configured duration is different
    const totalDuration = farmSettings?.broilerDuration || 8;
    if (totalDuration > phases[phases.length - 1].endWeek) {
      broilerMilestones.push({
        week: totalDuration,
        label: 'Ready for sale',
        completed: week >= totalDuration,
        current: week >= phases[phases.length - 1].endWeek + 1 && week < totalDuration,
      });
    }

    setMilestones(broilerMilestones);

    // Find current phase and next phase
    const foundPhaseIdx = phases.findIndex(p => week >= p.startWeek && week <= p.endWeek);
    if (foundPhaseIdx >= 0) {
      const foundPhase = phases[foundPhaseIdx];
      setCurrentPhase(foundPhase.name);
      setFeedType(foundPhase.feedType);
      setCurrentPhaseData(foundPhase);
      setNextPhaseData(phases[foundPhaseIdx + 1] || null);
    } else {
      setCurrentPhase('Unknown');
      setFeedType('N/A');
      setCurrentPhaseData(null);
      setNextPhaseData(null);
    }
  };

  const setLayerMilestones = (week: number) => {
    // Default phases matching the original milestones
    const DEFAULT_LAYER_PHASES = [
      { name: 'Chick', startWeek: 1, endWeek: 5, feedType: 'Starter' },
      { name: 'Grower', startWeek: 6, endWeek: 12, feedType: 'Grower' },
      { name: 'Pullet', startWeek: 13, endWeek: 17, feedType: 'Developer' },
      { name: 'Pre-lay', startWeek: 18, endWeek: 20, feedType: 'Pre-layer' },
      { name: 'Laying', startWeek: 21, endWeek: 72, feedType: 'Layer mash' },
    ];

    // Use configured phases if available, otherwise use defaults
    const phases = farmSettings?.layerPhases && farmSettings.layerPhases.length > 0
      ? farmSettings.layerPhases
      : DEFAULT_LAYER_PHASES;

    const layerMilestones: Milestone[] = phases.map(phase => ({
      week: phase.startWeek,
      label: `${phase.name} - ${phase.feedType}`,
      completed: week > phase.endWeek,
      current: week >= phase.startWeek && week <= phase.endWeek,
    }));

    setMilestones(layerMilestones);

    // Find current phase
    const foundPhase = phases.find(p => week >= p.startWeek && week <= p.endWeek);
    if (foundPhase) {
      setCurrentPhase(foundPhase.name);
      setFeedType(foundPhase.feedType);
      setCurrentPhaseData(foundPhase);
    } else {
      setCurrentPhase('Unknown');
      setFeedType('N/A');
      setCurrentPhaseData(null);
    }
  };

  if (!flock) {
    return (
      <div className="section-card-yellow p-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">{t('dashboard.production_cycle')}</h3>
        </div>
        <p className="text-gray-500 text-sm">{t('dashboard.select_flock_for_cycle')}</p>
      </div>
    );
  }

  const isBroiler = flock.type?.toLowerCase() === 'broiler';
  const isRabbit = (flock as any).species === 'rabbits'
    || (flock.type as string) === 'Meat Rabbits' || (flock.type as string) === 'Breeder Rabbits';

  // Calculate weeks until next phase (for display only, no state updates)
  const weeksUntilNextPhase = currentPhaseData
    ? Math.max(0, currentPhaseData.endWeek - currentWeek)
    : Math.max(0, targetWeek - currentWeek);

  return (
    <div className="section-card-yellow relative overflow-hidden p-4">
      <div className="absolute top-0 right-0 w-32 h-32 bg-neon-500/20 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-gray-700" />
            <h3 className="font-semibold text-gray-900">{t('dashboard.production_cycle')}</h3>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/60 rounded-full">
            {isRabbit ? (
              <RabbitIcon className="w-4 h-4 text-amber-700" />
            ) : isBroiler ? (
              <Scale className="w-4 h-4 text-orange-600" />
            ) : (
              <Egg className="w-4 h-4 text-blue-600" />
            )}
            <span className="text-xs font-medium text-gray-700 capitalize">{flock.type}</span>
          </div>
        </div>

        <div className="mb-3">
          <p className="text-sm text-gray-600 mb-1">{flock.name}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{t('dashboard.week_label', { week: currentWeek })}</span>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">{t('dashboard.progress')}</span>
            <span className="text-sm font-medium text-gray-700">
              {/* Audit fix: was rendering "1 weeks until next phase" — pass
                  count to i18next so the _one/_other keys take over. */}
              {weeksUntilNextPhase > 0
                ? t('production_cycle.weeks_until_next_phase', { weeks: weeksUntilNextPhase, count: weeksUntilNextPhase })
                : t('production_cycle.phase_complete')}
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-neon-400 to-neon-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          {currentPhaseData ? (
            <p className="text-xs text-gray-500 mt-1">{t('production_cycle.phase_progress', { 
              percent: progress.toFixed(1), 
              phase: currentPhase, 
              currentWeek, 
              startWeek: currentPhaseData.startWeek, 
              endWeek: currentPhaseData.endWeek 
            })}</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">{t('production_cycle.cycle_progress', { percent: progress.toFixed(1), currentWeek, targetWeek })}</p>
          )}
        </div>

        <div className="mb-3 p-2.5 bg-white/40 rounded-xl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('dashboard.current_phase')}</p>
              <p className="font-semibold text-gray-900">{currentPhase}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('dashboard.feed_type')}</p>
              <p className="font-semibold text-gray-900">{feedType}</p>
            </div>
          </div>
        </div>

        {isBroiler && (
          <div className={`mb-3 p-2.5 rounded-lg ${
            weightData.isOverdue
              ? 'bg-red-100'
              : weightData.averageWeight
              ? 'bg-yellow-100'
              : 'bg-blue-50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-gray-600 uppercase tracking-wide mb-0.5">{t('dashboard.week_weight', { week: currentWeek })}</p>
                {weightData.averageWeight ? (
                  <>
                    <p className="text-xl font-bold text-gray-900">
                      {weightData.averageWeight.toFixed(2)} kg
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('dashboard.recorded_on')} {new Date(weightData.date!).toLocaleDateString()}
                    </p>
                  </>
                ) : weightData.isOverdue ? (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <p className="text-sm font-semibold text-red-700">{t('dashboard.overdue')}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">{t('dashboard.not_yet_recorded')}</p>
                )}
              </div>
              <Scale className={`w-5 h-5 ${
                weightData.isOverdue
                  ? 'text-red-600'
                  : weightData.averageWeight
                  ? 'text-yellow-600'
                  : 'text-gray-400'
              }`} />
            </div>
          </div>
        )}

        {/* Phase C: rabbit-specific pills (kindling rate + FCR).
            Pills only render when their metric is populated, so non-rabbit
            flocks see nothing extra. */}
        {isRabbit && (rabbitMetrics.kindlingRate || rabbitMetrics.fcr) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {rabbitMetrics.kindlingRate && rabbitMetrics.kindlingRate.status !== 'invalid' && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  rabbitMetrics.kindlingRate.color === 'green'
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : rabbitMetrics.kindlingRate.color === 'amber'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-red-100 text-red-800 border-red-200'
                }`}
                title={rabbitMetrics.kindlingRate.message}
              >
                Kindling {formatKindlingRate(rabbitMetrics.kindlingRate.kitsPerDoePerYear)}
              </span>
            )}
            {rabbitMetrics.fcr && rabbitMetrics.fcr.fcr !== null && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  rabbitMetrics.fcr.color === 'green'
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : rabbitMetrics.fcr.color === 'amber'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-red-100 text-red-800 border-red-200'
                }`}
                title={`Rabbit FCR: ${formatRabbitFCR(rabbitMetrics.fcr.fcr)} kg feed / kg gain — ${rabbitMetrics.fcr.label}`}
              >
                FCR {formatRabbitFCR(rabbitMetrics.fcr.fcr)}
              </span>
            )}
          </div>
        )}

        <div className="mb-3">
          <p className="text-sm font-medium text-gray-700 mb-2">{t('dashboard.key_milestones')}</p>
          <div className="space-y-2">
            {milestones.slice(0, 4).map((milestone, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 text-sm ${
                  milestone.completed
                    ? 'text-gray-500'
                    : milestone.current
                    ? 'text-gray-900 font-medium'
                    : 'text-gray-400'
                }`}
              >
                {milestone.completed ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : milestone.current ? (
                  <div className="w-4 h-4 rounded-full border-2 border-neon-500 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-neon-500" />
                  </div>
                ) : (
                  <Circle className="w-4 h-4 text-gray-300" />
                )}
                <span>Week {milestone.week}: {milestone.label}</span>
              </div>
            ))}
          </div>
        </div>

        {isBroiler && weeksUntilNextPhase === 0 && currentPhaseData && (
          <div className={`p-3 rounded-xl mb-3 border ${nextPhaseData ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-start gap-2">
              <Zap className={`w-4 h-4 mt-0.5 flex-shrink-0 ${nextPhaseData ? 'text-amber-600' : 'text-green-600'}`} />
              <div>
                <p className={`text-sm font-semibold ${nextPhaseData ? 'text-amber-800' : 'text-green-800'}`}>
                  {nextPhaseData
                    ? `${currentPhaseData.name} phase complete!`
                    : '🥩 Harvest time!'}
                </p>
                <p className={`text-xs mt-0.5 ${nextPhaseData ? 'text-amber-700' : 'text-green-700'}`}>
                  {nextPhaseData
                    ? `Switch feed to ${nextPhaseData.feedType} and move birds to ${nextPhaseData.name} phase.`
                    : `Your birds have completed the ${currentPhaseData.name} phase — they're ready to sell.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {onNavigate && (
          <button
            onClick={() => onNavigate('insights')}
            className="w-full py-2 text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center justify-center gap-1 bg-white/40 rounded-xl hover:bg-white/60 transition-colors"
          >
            View Production Details
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
