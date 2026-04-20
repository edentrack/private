import { useEffect, useState } from 'react';
import { Calendar, Clock, TrendingUp, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { FlockCycleStatus, Flock } from '../../types/database';
import { canPerformAction } from '../../utils/navigationPermissions';
import { usePermissions } from '../../contexts/PermissionsContext';

interface FlockCycleCountdownCardProps {
  flockId: string;
  onNavigate?: (view: string) => void;
  compact?: boolean;
}

export function FlockCycleCountdownCard({ flockId, onNavigate, compact = false }: FlockCycleCountdownCardProps) {
  const { currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const [flock, setFlock] = useState<Flock | null>(null);
  const [cycleStatus, setCycleStatus] = useState<FlockCycleStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const canEdit = canPerformAction(
    currentRole,
    'edit',
    { module: 'Settings' },
    farmPermissions
  );

  useEffect(() => {
    if (flockId) {
      loadData();
    }
  }, [flockId]);

  const loadData = async () => {
    try {
      const [flockRes, cycleRes] = await Promise.all([
        supabase.from('flocks').select('*').eq('id', flockId).maybeSingle(),
        supabase.rpc('get_flock_cycle_status', { p_flock_id: flockId })
      ]);

      if (flockRes.data) {
        setFlock(flockRes.data);
      }

      if (cycleRes.data && cycleRes.data.length > 0) {
        setCycleStatus(cycleRes.data[0]);
      } else {
        setCycleStatus(null);
      }
    } catch (error) {
      console.error('Error loading flock cycle:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-2xl p-4 border border-gray-200 ${compact ? '' : 'p-6'}`}>
        <div className="animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-1/3 mb-3"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!flock) return null;

  const flockType = flock.type || flock.purpose || 'Unknown';
  const hasCycle = cycleStatus !== null;

  if (compact) {
    return (
      <div className="bg-white rounded-xl p-4 border border-gray-200 hover:border-green-300 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{flock.name}</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              flockType === 'Layer' || flockType === 'layer'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {flockType}
            </span>
          </div>
          {hasCycle && (
            <span className="text-lg font-bold text-gray-900">Week {cycleStatus.current_week}</span>
          )}
        </div>
        {hasCycle ? (
          <div className="text-sm text-gray-600">
            <span>{cycleStatus.countdown_label}</span>
            {cycleStatus.target_weeks && cycleStatus.weeks_remaining_to_target !== null && (
              <span className="ml-2 text-gray-400">
                ({cycleStatus.weeks_remaining_to_target} to target)
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-400">Cycle not set</div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-5 border border-green-200">
      <div className="flex items-start gap-4">
        <div className="p-2 bg-white rounded-xl shadow-sm">
          <TrendingUp className="w-6 h-6 text-green-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900">{flock.name}</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  flockType === 'Layer' || flockType === 'layer'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {flockType}
                </span>
              </div>
              {hasCycle ? (
                <div className="text-3xl font-bold text-gray-900">
                  Week {cycleStatus.current_week}
                </div>
              ) : (
                <div className="text-lg font-medium text-gray-500">
                  Cycle Not Set
                </div>
              )}
            </div>
            {canEdit && onNavigate && (
              <button
                onClick={() => onNavigate('settings')}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                title="Edit cycle settings"
              >
                <Settings className="w-4 h-4 text-gray-600" />
              </button>
            )}
          </div>

          {hasCycle ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">
                  {cycleStatus.countdown_label}
                </span>
              </div>

              <div className="flex items-center gap-2 text-gray-600">
                <Calendar className="w-4 h-4 text-green-600" />
                <span className="text-sm">
                  {new Date(cycleStatus.week_start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(cycleStatus.week_end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>

              {cycleStatus.target_weeks && cycleStatus.weeks_remaining_to_target !== null && (
                <div className="mt-2 pt-2 border-t border-green-200">
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold text-green-700">
                      {cycleStatus.weeks_remaining_to_target}
                    </span>
                    {' '}weeks remaining to reach Week {cycleStatus.target_weeks}
                  </div>
                  <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (cycleStatus.current_week / cycleStatus.target_weeks) * 100
                        )}%`
                      }}
                    />
                  </div>
                  {cycleStatus.target_reached_notes && (
                    <div className="mt-2 p-2 bg-white/50 rounded-lg">
                      <div className="text-xs font-medium text-green-700 mb-0.5">At target:</div>
                      <div className="text-sm text-gray-700">{cycleStatus.target_reached_notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2">
              {canEdit ? (
                <>
                  <p className="text-sm text-gray-600 mb-3">
                    Set a cycle start date to track production weeks.
                  </p>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate('settings')}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#3D5F42] text-white rounded-lg font-medium hover:bg-[#2F4A34] transition-colors text-sm"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Set cycle
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Cycle not set for this flock yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
