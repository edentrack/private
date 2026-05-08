import { useEffect, useState, useMemo } from 'react';
import { Clock, Target, AlertCircle, ArrowRight, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { FlockCycleRollupItem } from '../../types/database';

interface FarmRollupCycleCardProps {
  onNavigate?: (view: string) => void;
}

export function FarmRollupCycleCard({ onNavigate }: FarmRollupCycleCardProps) {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [rollupItems, setRollupItems] = useState<FlockCycleRollupItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentFarm?.id) {
      loadRollupData();
    }
  }, [currentFarm?.id]);

  const loadRollupData = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data } = await supabase.rpc('get_farm_cycle_rollup', {
        p_farm_id: currentFarm.id
      });

      if (data) {
        setRollupItems(data);
      }
    } catch (error) {
      console.error('Error loading farm cycle rollup:', error);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    if (rollupItems.length === 0) {
      return {
        activeFlocks: 0,
        flocksWithCycles: 0,
        soonestDaysRemaining: null,
        earliestWeekEndFlock: null,
        maxWeek: null,
        label: isFr ? 'Aucun troupeau actif' : 'No active flocks'
      };
    }

    const flocksWithCycles = rollupItems.filter(item => item.has_cycle);
    const flocksWithDays = flocksWithCycles.filter(item => item.days_remaining !== null);

    let soonestDaysRemaining: number | null = null;
    let earliestWeekEndFlock: FlockCycleRollupItem | null = null;
    let maxWeek: number | null = null;

    flocksWithDays.forEach(item => {
      if (item.days_remaining !== null) {
        if (soonestDaysRemaining === null || item.days_remaining < soonestDaysRemaining) {
          soonestDaysRemaining = item.days_remaining;
          earliestWeekEndFlock = item;
        }
      }
      if (item.current_week !== null) {
        if (maxWeek === null || item.current_week > maxWeek) {
          maxWeek = item.current_week;
        }
      }
    });

    let label = isFr ? 'Aucun troupeau actif' : 'No active flocks';
    if (flocksWithCycles.length === 0 && rollupItems.length > 0) {
      label = isFr
        ? `${rollupItems.length} troupeau${rollupItems.length > 1 ? 'x' : ''} - aucun cycle défini`
        : `${rollupItems.length} flock${rollupItems.length > 1 ? 's' : ''} - no cycles set`;
    } else if (soonestDaysRemaining !== null && earliestWeekEndFlock) {
      const flockName = (earliestWeekEndFlock as FlockCycleRollupItem).flock_name;
      if (soonestDaysRemaining === 0) {
        label = isFr
          ? `La semaine se termine aujourd'hui pour ${flockName}`
          : `Week ends today for ${flockName}`;
      } else if (soonestDaysRemaining === 1) {
        label = isFr
          ? `Une nouvelle semaine commence demain pour ${flockName}`
          : `New week starts tomorrow for ${flockName}`;
      } else {
        label = isFr
          ? `La semaine prochaine se termine dans ${soonestDaysRemaining} jours`
          : `Next week ends in ${soonestDaysRemaining} days`;
      }
    }

    const flocksWithTargets = flocksWithCycles.filter(item => item.target_weeks !== null);
    const targetSummary = flocksWithTargets.length > 0
      ? (isFr
          ? `${flocksWithTargets.length} sur ${rollupItems.length} troupeaux ont des semaines cibles définies`
          : `${flocksWithTargets.length} of ${rollupItems.length} flocks have target weeks set`)
      : null;

    return {
      activeFlocks: rollupItems.length,
      flocksWithCycles: flocksWithCycles.length,
      soonestDaysRemaining,
      earliestWeekEndFlock,
      maxWeek,
      label,
      targetSummary
    };
  }, [rollupItems, isFr]);

  if (loading) {
    return (
      <div className="section-card">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-xl animate-pulse" />
          <div className="flex-1">
            <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
            <div className="h-6 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (rollupItems.length === 0) {
    return null;
  }

  const hasAnyCycles = summary.flocksWithCycles > 0;

  return (
    <div className="section-card">
      <div className="flex items-start gap-4">
        <div className="icon-circle-yellow">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="stat-label mb-2">{isFr ? 'Aperçu de la ferme' : 'Farm Overview'}</div>
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl font-bold text-gray-900">
              {isFr
                ? `${summary.activeFlocks} troupeau${summary.activeFlocks !== 1 ? 'x' : ''} actif${summary.activeFlocks !== 1 ? 's' : ''}`
                : `${summary.activeFlocks} Active Flock${summary.activeFlocks !== 1 ? 's' : ''}`}
            </div>
            {hasAnyCycles && summary.maxWeek && (
              <span className="badge-yellow">
                {isFr ? 'Semaine max.' : 'Max Week'} {summary.maxWeek}
              </span>
            )}
          </div>

          {hasAnyCycles ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{summary.label}</span>
              </div>

              {summary.targetSummary && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Target className="w-4 h-4 text-gray-400" />
                  <span className="text-sm">{summary.targetSummary}</span>
                </div>
              )}

              {summary.flocksWithCycles < summary.activeFlocks && (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">
                    {isFr
                      ? `${summary.activeFlocks - summary.flocksWithCycles} troupeau${summary.activeFlocks - summary.flocksWithCycles > 1 ? 'x' : ''} sans cycle`
                      : `${summary.activeFlocks - summary.flocksWithCycles} flock${summary.activeFlocks - summary.flocksWithCycles > 1 ? 's' : ''} without cycles`}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{isFr ? 'Aucun cycle de production configuré pour le moment' : 'No production cycles configured yet'}</span>
            </div>
          )}

          {!hasAnyCycles && onNavigate && (
            <button
              onClick={() => onNavigate('settings')}
              className="mt-4 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1"
            >
              {isFr ? 'Configurer les cycles dans les paramètres' : 'Configure cycles in Settings'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
