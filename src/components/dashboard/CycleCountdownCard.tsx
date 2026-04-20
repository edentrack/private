import { useEffect, useState } from 'react';
import { Calendar, Clock, TrendingUp, Settings, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { FlockCycleStatus, FlockCycleRollupItem } from '../../types/database';
import { canPerformAction } from '../../utils/navigationPermissions';
import { usePermissions } from '../../contexts/PermissionsContext';

interface CycleCountdownCardProps {
  onNavigate?: (view: string) => void;
  selectedFlockId?: string | null;
  onFlockSelect?: (flockId: string) => void;
}

export function CycleCountdownCard({ onNavigate, selectedFlockId, onFlockSelect }: CycleCountdownCardProps) {
  const { currentFarm, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const [activeFlockStatus, setActiveFlockStatus] = useState<FlockCycleStatus | null>(null);
  const [rollupItems, setRollupItems] = useState<FlockCycleRollupItem[]>([]);
  const [loading, setLoading] = useState(true);

  const canEdit = canPerformAction(
    currentRole,
    'edit',
    { module: 'Settings' },
    farmPermissions
  );

  useEffect(() => {
    if (currentFarm?.id) {
      loadCycleData();
    }
  }, [currentFarm?.id, selectedFlockId]);

  const loadCycleData = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data: rollupData } = await supabase.rpc('get_farm_cycle_rollup', {
        p_farm_id: currentFarm.id
      });

      if (rollupData && rollupData.length > 0) {
        setRollupItems(rollupData);

        const activeItem = selectedFlockId
          ? rollupData.find((item: FlockCycleRollupItem) => item.flock_id === selectedFlockId)
          : rollupData[0];

        if (activeItem?.has_cycle) {
          const { data: statusData } = await supabase.rpc('get_flock_cycle_status', {
            p_flock_id: activeItem.flock_id
          });

          if (statusData && statusData.length > 0) {
            setActiveFlockStatus(statusData[0]);
          } else {
            setActiveFlockStatus(null);
          }
        } else {
          setActiveFlockStatus(null);
        }
      } else {
        setRollupItems([]);
        setActiveFlockStatus(null);
      }
    } catch (error) {
      console.error('Error loading cycle data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFlockClick = (flockId: string) => {
    if (onFlockSelect) {
      onFlockSelect(flockId);
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-3xl p-6 border border-green-200">
        <div className="animate-pulse">
          <div className="h-6 bg-green-200 rounded w-1/3 mb-4"></div>
          <div className="h-12 bg-green-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (rollupItems.length === 0) {
    return null;
  }

  const activeItem = selectedFlockId
    ? rollupItems.find(item => item.flock_id === selectedFlockId)
    : rollupItems[0];

  const hasActiveCycle = activeItem?.has_cycle && activeFlockStatus;
  const otherFlocks = rollupItems.filter(item => item.flock_id !== activeItem?.flock_id);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-3xl p-6 border border-green-200">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-2xl shadow-sm">
            <TrendingUp className="w-7 h-7 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-medium text-green-600 mb-1">
                  Production Cycle
                </div>
                {hasActiveCycle ? (
                  <>
                    <div className="text-4xl font-bold text-gray-900 mb-2">
                      Week {activeFlockStatus.current_week}
                    </div>
                    <div className="text-sm text-gray-600 mb-1">
                      Active flock: <span className="font-medium text-gray-900">{activeItem?.flock_name}</span>
                      <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-white/50">
                        {activeItem?.flock_type}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xl font-bold text-gray-900 mb-2">
                      Cycle Not Set
                    </div>
                    {activeItem && (
                      <div className="text-sm text-gray-600 mb-1">
                        {activeItem.flock_name}
                        <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-white/50">
                          {activeItem.flock_type}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
              {canEdit && onNavigate && (
                <button
                  onClick={() => onNavigate('settings')}
                  className="p-2 hover:bg-white/50 rounded-xl transition-colors"
                  title="Edit cycle settings"
                >
                  <Settings className="w-5 h-5 text-gray-600" />
                </button>
              )}
            </div>

            {hasActiveCycle ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">
                    {activeFlockStatus.countdown_label}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4 text-green-600" />
                  <span className="text-sm">
                    {new Date(activeFlockStatus.week_start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(activeFlockStatus.week_end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                {activeFlockStatus.target_weeks && activeFlockStatus.weeks_remaining_to_target !== null && (
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold text-green-700">
                        {activeFlockStatus.weeks_remaining_to_target}
                      </span>
                      {' '}weeks remaining to reach Week {activeFlockStatus.target_weeks}
                    </div>
                    <div className="mt-2 h-2 bg-white rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            (activeFlockStatus.current_week / activeFlockStatus.target_weeks) * 100
                          )}%`
                        }}
                      />
                    </div>
                    {activeFlockStatus.target_reached_notes && (
                      <div className="mt-3 p-3 bg-white/50 rounded-xl">
                        <div className="text-xs font-medium text-green-700 mb-1">At target week:</div>
                        <div className="text-sm text-gray-700">{activeFlockStatus.target_reached_notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2">
                {canEdit ? (
                  <p className="text-sm text-gray-600 mb-3">
                    Set a cycle start date to track production weeks for this flock.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    Cycle not set for this flock yet.
                  </p>
                )}
                {canEdit && onNavigate && (
                  <button
                    onClick={() => onNavigate('settings')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white rounded-xl font-medium hover:bg-[#2F4A34] transition-colors text-sm"
                  >
                    <Settings className="w-4 h-4" />
                    Set cycle start date
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {otherFlocks.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700">All Flocks</h4>
          </div>
          <div className="divide-y divide-gray-100">
            {otherFlocks.map((item) => (
              <button
                key={item.flock_id}
                onClick={() => handleFlockClick(item.flock_id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {item.flock_name}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      item.flock_type === 'Layer'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {item.flock_type}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-0.5">
                    {item.has_cycle ? (
                      <>
                        <span className="font-medium">Week {item.current_week}</span>
                        <span className="mx-1">·</span>
                        <span>{item.countdown_label}</span>
                      </>
                    ) : (
                      <span className="text-gray-400">Cycle not set</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
