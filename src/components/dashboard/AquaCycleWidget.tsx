import { useState, useEffect } from 'react';
import { RefreshCw, Check, Circle, ArrowRight, Scale, Fish, AlertCircle, Zap } from 'lucide-react';
import { Flock } from '../../types/database';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { getFlockAgeDays } from '../../utils/flockAge';

interface AquaCycleWidgetProps {
  pond: Flock | null;
  onNavigate?: (view: string) => void;
}

interface Milestone {
  week: number;
  label: string;
  completed: boolean;
  current: boolean;
}

interface SampleData {
  abwG: number | null;
  date: string | null;
  isOverdue: boolean;
  weekNumber: number;
}

/**
 * Default cycle phases per fish species.
 * Mirrors the shape of the poultry broiler/layer phases so the widget can render
 * the same way visually.
 */
type FishPhase = { name: string; startWeek: number; endWeek: number; feedType: string };

// Catfish lifecycle phases. Names match standard aquaculture terminology so the
// app teaches farmers the right vocabulary as they use it (mirrors how the
// poultry widget shows "Chick / Grower / Pullet" not "Stage 1 / Stage 2").
//
//   Fingerling — stocked at 5–10g, growing to ~20g
//   Juvenile  — 20–200g, fastest growth phase, switch feed protein down
//   Grow-out  — 200g to ~700g, biggest feed costs of the cycle
//   Pre-harvest — 700g–1.2kg, market-ready, reduce feeding 24h before harvest
const CATFISH_PHASES: FishPhase[] = [
  { name: 'Fingerling', startWeek: 1, endWeek: 4, feedType: 'Starter (45–50% protein)' },
  { name: 'Juvenile', startWeek: 5, endWeek: 12, feedType: 'Grower (40–45% protein)' },
  { name: 'Grow-out', startWeek: 13, endWeek: 20, feedType: 'Grower (40–45% protein)' },
  { name: 'Pre-harvest', startWeek: 21, endWeek: 24, feedType: 'Finisher (35–40% protein)' },
];

// Tilapia lifecycle phases. Same biological progression as catfish but
// shorter cycle and lower-protein feed bands.
//
//   Fingerling — stocked at 5–15g, growing to ~25g
//   Juvenile  — 25–100g, mono-sex critical here to avoid breeding
//   Grow-out  — 100–400g, peak feed conversion
//   Pre-harvest — 400g–800g, market-ready
const TILAPIA_PHASES: FishPhase[] = [
  { name: 'Fingerling', startWeek: 1, endWeek: 4, feedType: 'Starter (40% protein)' },
  { name: 'Juvenile', startWeek: 5, endWeek: 10, feedType: 'Grower (32–36% protein)' },
  { name: 'Grow-out', startWeek: 11, endWeek: 18, feedType: 'Grower (32–36% protein)' },
  { name: 'Pre-harvest', startWeek: 19, endWeek: 22, feedType: 'Finisher (28–32% protein)' },
];

function getPhasesForType(type: string | null | undefined): { phases: FishPhase[]; targetWeek: number } {
  const t = (type || '').toLowerCase();
  if (t === 'tilapia') return { phases: TILAPIA_PHASES, targetWeek: 22 };
  // Catfish, Clarias, Other Fish, default → catfish curve
  return { phases: CATFISH_PHASES, targetWeek: 24 };
}

export function AquaCycleWidget({ pond, onNavigate }: AquaCycleWidgetProps) {
  const { currentFarm } = useAuth();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('');
  const [feedType, setFeedType] = useState('');
  const [targetWeek, setTargetWeek] = useState(24);
  const [currentPhaseData, setCurrentPhaseData] = useState<FishPhase | null>(null);
  const [nextPhaseData, setNextPhaseData] = useState<FishPhase | null>(null);
  const [sample, setSample] = useState<SampleData>({
    abwG: null,
    date: null,
    isOverdue: false,
    weekNumber: 0,
  });

  useEffect(() => {
    if (pond) {
      calculateCycle();
      fetchLatestSample();
    }
  }, [pond?.id]);

  // Re-calculate phase on tab refocus / visibility change (handles tab left open across days)
  useEffect(() => {
    if (!pond) return;
    const onVisible = () => { if (document.visibilityState === 'visible') calculateCycle(); };
    const onFocus = () => calculateCycle();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [pond?.id]);

  // Recompute phase progress when phase or week changes
  useEffect(() => {
    if (!currentPhaseData || currentWeek === 0) {
      setProgress(0);
      return;
    }
    const phaseDuration = currentPhaseData.endWeek - currentPhaseData.startWeek + 1;
    const weeksIntoPhase = currentWeek - currentPhaseData.startWeek + 1;
    setProgress(Math.min((weeksIntoPhase / phaseDuration) * 100, 100));
  }, [currentPhaseData, currentWeek]);

  // Live updates: re-fetch on new sampling event
  useEffect(() => {
    if (!pond) return;
    const sub = supabase
      .channel(`sampling_events_${pond.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sampling_events', filter: `flock_id=eq.${pond.id}` },
        () => fetchLatestSample(),
      )
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [pond?.id]);

  const calculateCycle = () => {
    if (!pond) return;
    // Honour age_at_arrival_days — handles fish bought as fingerlings/juveniles
    // (and any pond the user starts to track retroactively).
    const week = Math.max(1, Math.floor(getFlockAgeDays(pond) / 7) + 1);
    setCurrentWeek(week);

    const { phases, targetWeek: tw } = getPhasesForType(pond.type);
    setTargetWeek(tw);

    // Build milestones list (one row per phase, with "Harvest" appended)
    const ms: Milestone[] = phases.map(p => ({
      week: p.startWeek,
      label: `${p.name} · ${p.feedType.split(' ')[0]}`,
      completed: week > p.endWeek,
      current: week >= p.startWeek && week <= p.endWeek,
    }));
    ms.push({
      week: tw,
      label: 'Harvest',
      completed: week >= tw,
      current: week >= phases[phases.length - 1].endWeek + 1 && week < tw,
    });
    setMilestones(ms);

    // Find the current phase
    const idx = phases.findIndex(p => week >= p.startWeek && week <= p.endWeek);
    if (idx >= 0) {
      const cur = phases[idx];
      setCurrentPhase(cur.name);
      setFeedType(cur.feedType);
      setCurrentPhaseData(cur);
      setNextPhaseData(phases[idx + 1] || null);
    } else if (week >= tw) {
      setCurrentPhase('Harvest ready');
      setFeedType('—');
      setCurrentPhaseData(null);
      setNextPhaseData(null);
    } else {
      setCurrentPhase('Unknown');
      setFeedType('N/A');
      setCurrentPhaseData(null);
      setNextPhaseData(null);
    }
  };

  const fetchLatestSample = async () => {
    if (!pond || !currentFarm?.id) return;
    const { data } = await supabase
      .from('sampling_events')
      .select('abw_g, sampled_at')
      .eq('farm_id', currentFarm.id)
      .eq('flock_id', pond.id)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ageDays = getFlockAgeDays(pond);
    const week = Math.max(1, Math.floor(ageDays / 7) + 1);
    const now = new Date();

    // Sampling target: every 2 weeks. Overdue if last sample is more than 14 days ago.
    let isOverdue = false;
    if (!data) {
      // No sample yet — overdue once the pond is past week 2 (give farmers a 2-week grace).
      isOverdue = week > 2;
    } else {
      const lastSampleDays = Math.floor((now.getTime() - new Date(data.sampled_at).getTime()) / 86_400_000);
      isOverdue = lastSampleDays > 14;
    }

    setSample({
      abwG: data?.abw_g ?? null,
      date: data?.sampled_at ?? null,
      isOverdue,
      weekNumber: week,
    });
  };

  if (!pond) {
    return (
      <div className="section-card-yellow p-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Production Cycle</h3>
        </div>
        <p className="text-gray-500 text-sm">Select a pond to view its production cycle.</p>
      </div>
    );
  }

  const weeksUntilNextPhase = currentPhaseData
    ? Math.max(0, currentPhaseData.endWeek - currentWeek)
    : Math.max(0, targetWeek - currentWeek);

  return (
    <div className="section-card-yellow relative overflow-hidden p-4">
      <div className="absolute top-0 right-0 w-32 h-32 bg-neon-500/20 rounded-full blur-3xl" />

      <div className="relative">
        {/* Header — mirrors ProductionCycleWidget exactly */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-gray-700" />
            <h3 className="font-semibold text-gray-900">Production Cycle</h3>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/60 rounded-full">
            <Fish className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-gray-700 capitalize">{pond.type}</span>
          </div>
        </div>

        {/* Pond name + week */}
        <div className="mb-3">
          <p className="text-sm text-gray-600 mb-1">{pond.name}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">Week {currentWeek}</span>
          </div>
        </div>

        {/* Progress bar within current phase */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Progress</span>
            <span className="text-sm font-medium text-gray-700">
              {weeksUntilNextPhase > 0
                ? `${weeksUntilNextPhase}w until next phase`
                : 'Phase complete'}
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-neon-400 to-neon-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          {currentPhaseData ? (
            <p className="text-xs text-gray-500 mt-1">
              {progress.toFixed(1)}% through {currentPhase} (Week {currentWeek} of {currentPhaseData.startWeek}–{currentPhaseData.endWeek})
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Week {currentWeek} of {targetWeek} target — {Math.min(100, (currentWeek / targetWeek) * 100).toFixed(1)}%
            </p>
          )}
        </div>

        {/* Current phase + feed type — same grid as poultry */}
        <div className="mb-3 p-2.5 bg-white/40 rounded-xl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Current Phase</p>
              <p className="font-semibold text-gray-900">{currentPhase}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Feed Type</p>
              <p className="font-semibold text-gray-900">{feedType}</p>
            </div>
          </div>
        </div>

        {/* ABW sample card — mirrors the broiler weight card visually */}
        <div className={`mb-3 p-2.5 rounded-lg ${
          sample.isOverdue ? 'bg-red-100' : sample.abwG ? 'bg-yellow-100' : 'bg-blue-50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs text-gray-600 uppercase tracking-wide mb-0.5">
                Week {currentWeek} ABW
              </p>
              {sample.abwG ? (
                <>
                  <p className="text-xl font-bold text-gray-900">{sample.abwG.toFixed(1)} g</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Sampled on {new Date(sample.date!).toLocaleDateString()}
                  </p>
                </>
              ) : sample.isOverdue ? (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <p className="text-sm font-semibold text-red-700">Sample overdue</p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">Not yet sampled</p>
              )}
            </div>
            <Scale className={`w-5 h-5 ${
              sample.isOverdue ? 'text-red-600' : sample.abwG ? 'text-yellow-600' : 'text-gray-400'
            }`} />
          </div>
        </div>

        {/* Key milestones — same shape as poultry */}
        <div className="mb-3">
          <p className="text-sm font-medium text-gray-700 mb-2">Key Milestones</p>
          <div className="space-y-2">
            {milestones.slice(0, 4).map((m, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 text-sm ${
                  m.completed ? 'text-gray-500' : m.current ? 'text-gray-900 font-medium' : 'text-gray-400'
                }`}
              >
                {m.completed ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : m.current ? (
                  <div className="w-4 h-4 rounded-full border-2 border-neon-500 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-neon-500" />
                  </div>
                ) : (
                  <Circle className="w-4 h-4 text-gray-300" />
                )}
                <span>Week {m.week}: {m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Next-phase / harvest banner */}
        {weeksUntilNextPhase === 0 && currentPhaseData && (
          <div className={`p-3 rounded-xl mb-3 border ${nextPhaseData ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-start gap-2">
              <Zap className={`w-4 h-4 mt-0.5 flex-shrink-0 ${nextPhaseData ? 'text-amber-600' : 'text-green-600'}`} />
              <div>
                <p className={`text-sm font-semibold ${nextPhaseData ? 'text-amber-800' : 'text-green-800'}`}>
                  {nextPhaseData
                    ? `${currentPhaseData.name} phase complete!`
                    : '🐟 Harvest time!'}
                </p>
                <p className={`text-xs mt-0.5 ${nextPhaseData ? 'text-amber-700' : 'text-green-700'}`}>
                  {nextPhaseData
                    ? `Switch feed to ${nextPhaseData.feedType} and move into the ${nextPhaseData.name} phase.`
                    : `Your pond has completed ${currentPhaseData.name} — fish are at market size.`}
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
