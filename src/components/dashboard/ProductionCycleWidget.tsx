import { useState, useEffect } from 'react';
import { RefreshCw, Check, Circle, ArrowRight, Scale, Egg, AlertCircle } from 'lucide-react';
import { Flock } from '../../types/database';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

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

  useEffect(() => {
    if (flock && currentFarm?.id) {
      loadFarmSettings();
    }
  }, [flock, currentFarm?.id]);

  useEffect(() => {
    if (flock) {
      // Always calculate, even if farmSettings is null (will use defaults)
      calculateCycle();
      fetchWeightData();
    }
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

    const arrivalDate = new Date(flock.arrival_date || flock.created_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
    const week = Math.max(1, Math.floor(diffDays / 7) + 1);
    setCurrentWeek(week);

    const isBroiler = flock.type?.toLowerCase() === 'broiler';
    
    // Use farmSettings if available, otherwise use defaults
    // IMPORTANT: Use nullish coalescing to ensure 0 values are handled correctly
    const target = isBroiler 
      ? (farmSettings?.broilerDuration ?? 8)
      : (farmSettings?.layerDuration ?? 72);
    
    // Ensure target is a valid positive number
    const validTarget = target && target > 0 ? target : (isBroiler ? 8 : 72);
    setTargetWeek(validTarget);

    // Calculate PHASE progress after milestones/phase are set
    // This is the PHASE progress bar (shows progress within current phase)
    // We'll calculate this in a useEffect after currentPhaseData is set

    if (isBroiler) {
      setBroilerMilestones(week);
    } else {
      setLayerMilestones(week);
    }
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

    const arrivalDate = new Date(flock.arrival_date || flock.created_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
    const week = Math.max(1, Math.floor(diffDays / 7) + 1);

    const weekStartDate = new Date(arrivalDate);
    weekStartDate.setDate(arrivalDate.getDate() + (week - 1) * 7);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);

    const { data: weightLogs } = await supabase
      .from('weight_logs')
      .select('average_weight, date')
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
            {isBroiler ? (
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
              {weeksUntilNextPhase > 0 ? t('production_cycle.weeks_until_next_phase', { weeks: weeksUntilNextPhase }) : t('production_cycle.phase_complete')}
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

        {isBroiler && currentWeek >= 5 && (
          <div className="p-2.5 bg-green-100 rounded-xl mb-3">
            <p className="text-sm font-medium text-green-800">
              {currentWeek >= 6 ? 'Market Ready' : 'Approaching market weight'}
            </p>
            <p className="text-xs text-green-600">
              Target: 2.5 kg at Week 6-8
            </p>
          </div>
        )}

        {onNavigate && (
          <button
            onClick={() => onNavigate('settings')}
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
