import { useEffect, useState } from 'react';
import { Plus, ArrowRight, Archive, Pencil, AlertTriangle, History, RotateCcw, Trash2, X, Fish } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Flock } from '../../types/database';
import { CreateFlockModal } from './CreateFlockModal';
import { EditFlockModal } from './EditFlockModal';
import { LogMortalityModal } from '../mortality/LogMortalityModal';
import { ArchiveFlockModal } from './ArchiveFlockModal';
import { ChickenIcon } from '../icons/ChickenIcon';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { useTranslation } from 'react-i18next';
import { invalidateFarmTypeCache, useFarmType } from '../../hooks/useFarmType';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { FlockListSkeleton } from '../common/Skeleton';
import { atFlockLimit, getMaxFlocks } from '../../utils/planGating';
import { getFlockAge as getFlockAgeFromHelper } from '../../utils/flockAge';
import { pluralize } from '../../utils/pluralize';

interface FlockManagementProps {
  onSelectFlock: (flock: Flock) => void;
  onNavigate: (view: string) => void;
}

export function FlockManagement({ onSelectFlock, onNavigate }: FlockManagementProps) {
  const { user, currentRole, profile, currentFarm } = useAuth();
  const { t } = useTranslation();
  const { isAquaculture } = useFarmType();
  const farmSpecies = useFarmSpecies();
  const groupTerm = farmSpecies.groupTerm;          // "Flock" | "Pond" | "Rabbitry"
  const groupTermPlural = farmSpecies.groupTermPlural; // "Flocks" | "Ponds" | "Rabbitries"
  // The audit flagged that this page reverts to poultry copy on a rabbits
  // farm. Treat anything non-poultry as "use the species term explicitly"
  // and only fall through to the i18n strings (which are poultry-coded)
  // when the active species is poultry.
  const isPoultryView = farmSpecies.id === 'poultry';
  const toast = useToast();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [mortalityByFlock, setMortalityByFlock] = useState<Record<string, number>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFlock, setEditingFlock] = useState<Flock | null>(null);
  const [showMortalityModal, setShowMortalityModal] = useState(false);
  const [mortalityFlock, setMortalityFlock] = useState<Flock | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivingFlock, setArchivingFlock] = useState<Flock | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmingUnarchive, setConfirmingUnarchive] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const hideFinancials = shouldHideFinancialData(currentRole);

  useEffect(() => {
    if (user && currentFarm?.id) {
      loadFlocks();
    }
  }, [user, showArchived, currentFarm?.id]);

  const loadFlocks = async () => {
    try {
      const query = supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm?.id)
        .order('created_at', { ascending: false });

      if (showArchived) {
        query.in('status', ['sold', 'deceased', 'archived']);
      } else {
        query.eq('status', 'active');
      }

      const { data } = await query;
      setFlocks(data || []);

      if (data && data.length > 0) {
        const { data: mortalityData } = await supabase
          .from('mortality_logs')
          .select('flock_id, count')
          .eq('farm_id', currentFarm?.id)
          .in('flock_id', data.map(f => f.id));

        const mortalityMap: Record<string, number> = {};
        (mortalityData || []).forEach(log => {
          mortalityMap[log.flock_id] = (mortalityMap[log.flock_id] || 0) + (log.count || 0);
        });
        setMortalityByFlock(mortalityMap);
      }
    } catch (error) {
      console.error('Error loading flocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFlockTypeEmoji = (type: string) => {
    const map: Record<string, string> = {
      'Broiler': '🐔',
      'Layer': '🥚',
      'Dual-Purpose': '🍳',
      'Turkey': '🦃',
      'Duck': '🦆',
      'Catfish': '🐟',
      'Tilapia': '🐠',
      'Clarias': '🐡',
      'Other Fish': '🐟',
      'Meat Rabbits': '🐰',
      'Breeder Rabbits': '🐰',
    };
    if (map[type]) return map[type];
    // Audit fix: previously fell through to chicken emoji (🐓) for any
    // unmapped type. On a rabbit farm this rendered the rabbit card with a
    // chicken icon. Branch on the active farm species instead.
    if (isAquaculture) return '🐟';
    if (farmSpecies.id === 'rabbits') return '🐰';
    return '🐓';
  };

  // Pulled into the shared flockAge helper so age_at_arrival_days is honoured
  // (point-of-lay pullets, fingerlings, retroactive tracking).
  const formatFlockAge = (flock: Flock) => {
    const { weeks, days } = getFlockAgeFromHelper(flock);
    // Use pluralize so we get "1 week old" / "2 weeks old" — kills the
    // "1 weeks old" grammar bug surfaced in the audit.
    const weeksWord = pluralize(weeks, 'week');
    return (
      <>
        {weeks} <span className="text-lg font-medium text-gray-500">{weeksWord} old</span>
        {days > 0 && <span className="ml-1.5 text-sm font-normal text-gray-400">{days}d</span>}
      </>
    );
  };

  const handleFlockCreated = () => {
    setShowCreateModal(false);
    invalidateFarmTypeCache();
    loadFlocks();
  };

  const handleFlockUpdated = () => {
    setEditingFlock(null);
    loadFlocks();
  };

  const handleLogMortality = (flock: Flock) => {
    setMortalityFlock(flock);
    setShowMortalityModal(true);
  };

  const handleMortalityLogged = () => {
    loadFlocks();
  };

  const handleArchiveFlock = (flock: Flock) => {
    setArchivingFlock(flock);
    setShowArchiveModal(true);
  };

  const handleFlockArchived = () => {
    setShowArchiveModal(false);
    setArchivingFlock(null);
    invalidateFarmTypeCache();
    loadFlocks();
  };

  const handleUnarchiveFlock = async (flockId: string) => {
    try {
      const { error } = await supabase
        .from('flocks')
        .update({
          status: 'active',
          archived_at: null,
          archived_reason: null,
          archived_by: null,
        })
        .eq('id', flockId);

      if (error) throw error;

      toast.success(isAquaculture ? 'Pond restored successfully' : 'Flock restored successfully');
      setConfirmingUnarchive(null);
      invalidateFarmTypeCache();
      loadFlocks();
    } catch (err) {
      console.error('Error unarchiving flock:', err);
      toast.error('Failed to restore flock. Please try again.');
    }
  };

  const handlePermanentDelete = async (flockId: string) => {
    try {
      const { error } = await supabase
        .from('flocks')
        .delete()
        .eq('id', flockId);

      if (error) throw error;

      toast.success(isAquaculture ? 'Pond permanently deleted' : 'Flock permanently deleted');
      setConfirmingDelete(null);
      loadFlocks();
    } catch (err) {
      console.error('Error deleting flock:', err);
      toast.error('Failed to delete flock. Please try again.');
    }
  };

  if (loading) {
    return <FlockListSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div data-tour="flock-header" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Audit fix: previously fell back to t('flocks.title') ("Flock
              Management") for poultry which clashed with the species term
              shown in the subtitle and elsewhere. Drive the H1 directly off
              the species term so the page header, subtitle, and nav stay
              in sync. */}
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">
            {groupTermPlural}
          </h2>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {showArchived ? `Archived ${groupTermPlural}` : `Active ${groupTermPlural}`}
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3 w-full sm:w-auto justify-start sm:justify-end">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="btn-secondary inline-flex items-center justify-center flex-1 sm:flex-none"
          >
            {showArchived ? (
              <>
                <ArrowRight className="w-5 h-5 mr-2" />
                {t('flocks.active')}
              </>
            ) : (
              <>
                <History className="w-5 h-5 mr-2" />
                {t('flocks.archived')}
              </>
            )}
          </button>
          {!showArchived && currentRole && currentRole !== 'viewer' && (() => {
            const tier = profile?.subscription_tier;
            const limited = atFlockLimit(tier, flocks.length);
            const max = getMaxFlocks(tier);
            if (limited) {
              return (
                <button
                  onClick={() => onNavigate('subscribe')}
                  className="btn-primary inline-flex items-center justify-center flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600"
                >
                  Upgrade — {flocks.length}/{max} {groupTermPlural.toLowerCase()} used
                </button>
              );
            }
            return (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary inline-flex items-center justify-center flex-1 sm:flex-none"
              >
                <Plus className="w-5 h-5 mr-2" />
                {isPoultryView ? t('flocks.create_flock') : `Add ${groupTerm}`}
              </button>
            );
          })()}
        </div>
      </div>

      {flocks.length === 0 ? (
        <div className="section-card text-center py-12 animate-fade-in-up">
          {/* Empty state — driven entirely by the active species so this
              page no longer reverts to poultry copy on a rabbits farm. */}
          {(() => {
            // Visual treatment: blue for fish, neon for poultry, soft amber for rabbits
            const SpeciesIcon = farmSpecies.icon;
            const iconWrapBg = isAquaculture ? 'bg-blue-50' : isPoultryView ? 'bg-neon-100' : 'bg-amber-50';
            const iconClass = isAquaculture ? 'text-blue-500' : isPoultryView ? 'text-neon-600' : 'text-amber-600';

            const emptyHeadline = isPoultryView
              ? t('flocks.no_flocks_yet')
              : currentRole === 'viewer'
                ? `No ${groupTermPlural.toLowerCase()} yet`
                : `Add your first ${groupTerm.toLowerCase()}`;

            const emptyDescription = currentRole === 'viewer'
              ? isPoultryView
                ? t('flocks.no_flocks_worker_message')
                : `Your manager hasn't added any ${groupTermPlural.toLowerCase()} yet. Check back soon.`
              : isAquaculture
                ? 'A pond is how Edentrack tracks your fish — stocking, water quality, feed, and harvest all tie back to it.'
                : isPoultryView
                  ? t('flocks.no_flocks_owner_message')
                  : `A ${groupTerm.toLowerCase()} is how Edentrack tracks your ${farmSpecies.animalTermPlural.toLowerCase()} — feed, health, growth, and harvest all tie back to it.`;

            return (
              <>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${iconWrapBg}`}>
                  {isPoultryView
                    ? <ChickenIcon className={`w-10 h-10 ${iconClass}`} />
                    : <SpeciesIcon className={`w-10 h-10 ${iconClass}`} />}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{emptyHeadline}</h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm leading-relaxed">
                  {emptyDescription}
                </p>
              </>
            );
          })()}
          {currentRole && currentRole !== 'viewer' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary inline-flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              {isPoultryView ? t('flocks.create_flock') : `Create ${groupTerm}`}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {flocks.map((flock, index) => (
            <div
              key={flock.id}
              className="section-card hover:shadow-medium hover-lift cursor-pointer animate-fade-in-up"
              style={{ animationDelay: `${index * 0.05}s` }}
              onClick={() => {
                // Audit fix: tapping a flock/pond card with the "→" arrow
                // used to drop the user into Loss Tracking — confusing because
                // "Record Loss" already lives below the card. Now the card
                // selects the flock and routes to the dashboard so the user
                // sees a full per-flock overview (Production Cycle, daily
                // tasks, stats). Loss flow stays one-click from the inline
                // Record Loss/Mortality button below.
                onSelectFlock(flock);
                onNavigate('dashboard');
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{getFlockTypeEmoji(flock.type)} {flock.name}</h3>
                  <div className="flex items-center gap-2">
                    {isAquaculture ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                        <Fish className="w-3.5 h-3.5" />
                        {flock.type}
                      </div>
                    ) : (
                      <div className="badge-yellow inline-flex items-center gap-1.5">
                        {flock.type === 'Layer' ? (
                          <img src="/layer.jpg" alt="Layer" className="w-4 h-4 object-contain mix-blend-multiply" style={{ backgroundColor: 'transparent' }} />
                        ) : flock.type === 'Broiler' ? (
                          <img src="/broiler.png" alt="Broiler" className="w-4 h-4 object-contain mix-blend-multiply" style={{ backgroundColor: 'transparent' }} />
                        ) : (
                          <ChickenIcon className="w-4 h-4" />
                        )}
                        {flock.type}
                      </div>
                    )}
                    {showArchived && (
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        flock.status === 'sold' ? 'bg-emerald-100 text-emerald-700' :
                        flock.status === 'deceased' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {flock.status === 'sold' ? t('flocks.sold') :
                         flock.status === 'deceased' ? 'Deceased' :
                         t('flocks.archived')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!showArchived && currentRole && currentRole !== 'viewer' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFlock(flock);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <Pencil className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className={`p-4 rounded-2xl bg-gradient-to-br ${isAquaculture ? 'from-blue-50 to-blue-100/50' : 'from-neon-50 to-neon-100/50'}`}>
                  <div className="stat-label">{isAquaculture ? 'Age in Pond' : t('flocks.age')}</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {formatFlockAge(flock)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="stat-label">{`Initial ${farmSpecies.animalTerm} Count`}</div>
                    <div className="text-xl font-bold text-gray-900">{flock.initial_count.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="stat-label">{`Current ${farmSpecies.animalTerm} Count`}</div>
                    <div className="text-xl font-bold text-gray-900">{flock.current_count.toLocaleString()}</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="stat-label">{t('compare.survival_rate')}</span>
                    <span className="text-lg font-bold text-gray-900">
                      {(() => {
                        const mortality = mortalityByFlock[flock.id] || 0;
                        const survivalRate = flock.initial_count > 0
                          ? ((flock.initial_count - mortality) / flock.initial_count) * 100
                          : 100;
                        return survivalRate.toFixed(1);
                      })()}%
                    </span>
                  </div>
                  <div className="progress-bar-yellow">
                    <div
                      className="progress-bar-yellow-fill"
                      style={{ width: `${(flock.current_count / flock.initial_count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {showArchived ? (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  <div className="text-xs text-gray-500">
                    Archived {flock.archived_at ? new Date(flock.archived_at).toLocaleDateString() : 'N/A'}
                  </div>
                  {flock.status === 'sold' && flock.sale_price && (
                    <div className="text-sm font-semibold text-emerald-600">
                      {hideFinancials ? (
                        <span className="text-gray-400 italic">Sale Price: Hidden</span>
                      ) : (
                        <>Sale Price: ${flock.sale_price.toLocaleString()}</>
                      )}
                    </div>
                  )}
                  {flock.archived_reason && (
                    <div className="text-xs text-gray-600 line-clamp-2">
                      {flock.archived_reason}
                    </div>
                  )}

                  {confirmingUnarchive === flock.id && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm text-blue-900 font-medium">
                          Restore "{flock.name}"?
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingUnarchive(null);
                          }}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-xs text-blue-700">
                        {isAquaculture
                          ? 'This will bring the pond back to your active ponds.'
                          : 'This will bring the flock back to your active flocks.'}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnarchiveFlock(flock.id);
                          }}
                          className="flex-1 bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Yes, Restore
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingUnarchive(null);
                          }}
                          className="flex-1 bg-white text-blue-600 text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors border border-blue-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {confirmingDelete === flock.id && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm text-red-900 font-medium">
                          Delete "{flock.name}" forever?
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingDelete(null);
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-xs text-red-700 space-y-1">
                        <div className="font-medium">This will permanently delete:</div>
                        <ul className="list-disc list-inside space-y-0.5 ml-1">
                          <li>All expenses</li>
                          <li>All tasks</li>
                          <li>Mortality records</li>
                          <li>Weight checks</li>
                          <li>All other records</li>
                        </ul>
                        <div className="font-semibold mt-1">This CANNOT be undone!</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePermanentDelete(flock.id);
                          }}
                          className="flex-1 bg-red-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Yes, Delete Forever
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingDelete(null);
                          }}
                          className="flex-1 bg-white text-red-600 text-xs font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors border border-red-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {currentRole && currentRole !== 'viewer' && !confirmingUnarchive && !confirmingDelete && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingUnarchive(flock.id);
                        }}
                        className="flex-1 text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors border border-blue-200"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingDelete(flock.id);
                        }}
                        className="flex-1 text-xs text-red-600 hover:text-red-700 font-medium inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors border border-red-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Forever
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                  {currentRole && currentRole !== 'viewer' && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLogMortality(flock);
                        }}
                        className="text-xs text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {/* Use species lossNoun verbatim — "Mortality", "Loss", "Death" */}
                        {`Record ${farmSpecies.lossNoun}`}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveFlock(flock);
                        }}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium inline-flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        {isPoultryView ? t('flocks.archive_flock') : `Archive ${groupTerm}`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateFlockModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleFlockCreated}
        />
      )}

      {editingFlock && (
        <EditFlockModal
          flock={editingFlock}
          onClose={() => setEditingFlock(null)}
          onUpdated={handleFlockUpdated}
        />
      )}

      {showMortalityModal && (
        <LogMortalityModal
          flock={mortalityFlock}
          onClose={() => setShowMortalityModal(false)}
          onLogged={handleMortalityLogged}
        />
      )}

      {showArchiveModal && (
        <ArchiveFlockModal
          flock={archivingFlock}
          onClose={() => setShowArchiveModal(false)}
          onArchived={handleFlockArchived}
        />
      )}
    </div>
  );
}
