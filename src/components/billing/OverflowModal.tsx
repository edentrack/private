import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { getMaxFarms, getMaxFlocks, getMaxTeamMembers } from '../../utils/planGating';

/**
 * Overflow modal — shown when a user's data exceeds the limits of
 * their current effective tier. The most common trigger is the
 * 30-day Grower trial expiring while the user has 2 farms or 4
 * flocks (etc.) that no longer fit on the Free plan.
 *
 * The modal NEVER deletes data. Two paths:
 *   1. Upgrade to keep everything active (CTA opens checkout).
 *   2. Pick which items stay active; the rest go read-only and the
 *      user can still see them but cannot create new records inside
 *      them until they upgrade.
 *
 * Mounted high in the app tree (App.tsx) so it can interrupt any
 * page when overflow is detected.
 */

interface OverflowItem {
  id: string;
  type: 'farm' | 'flock' | 'team_member';
  name: string;
  context?: string;        // e.g. "Pen 1 in Audit Farm" for a flock
  isCurrentlyActive: boolean;
}

interface OverflowModalProps {
  open: boolean;
  onClose: () => void;
  effectiveTier: 'free' | 'pro' | 'enterprise' | 'industry';
  items: OverflowItem[];
  onUpgrade: () => void;
  onArchive: (selectedToKeepActive: string[]) => Promise<void>;
}

export function OverflowModal({
  open,
  onClose,
  effectiveTier,
  items,
  onUpgrade,
  onArchive,
}: OverflowModalProps) {
  const [mode, setMode] = useState<'choose' | 'pick'>('choose');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.filter(i => i.isCurrentlyActive).map(i => i.id)));
  const [saving, setSaving] = useState(false);

  // Group items by type so we can show one section per category.
  const grouped = useMemo(() => {
    const byType: Record<OverflowItem['type'], OverflowItem[]> = {
      farm: [],
      flock: [],
      team_member: [],
    };
    items.forEach(item => byType[item.type].push(item));
    return byType;
  }, [items]);

  const limits = useMemo(() => ({
    farm: getMaxFarms(effectiveTier),
    flock: getMaxFlocks(effectiveTier),
    team_member: getMaxTeamMembers(effectiveTier),
  }), [effectiveTier]);

  const tierLabel = effectiveTier === 'free' ? 'Free' : effectiveTier === 'pro' ? 'Grower' : effectiveTier === 'enterprise' ? 'Farm Boss' : 'Industry';

  if (!open) return null;

  const totalKept = selected.size;
  const farmCount = items.filter(i => i.type === 'farm' && selected.has(i.id)).length;
  const flockCount = items.filter(i => i.type === 'flock' && selected.has(i.id)).length;
  const teamCount = items.filter(i => i.type === 'team_member' && selected.has(i.id)).length;

  const overFarmLimit = farmCount > limits.farm;
  const overFlockLimit = flockCount > limits.flock;
  const overTeamLimit = teamCount > limits.team_member;
  const stillOverLimit = overFarmLimit || overFlockLimit || overTeamLimit;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onArchive(Array.from(selected));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">

        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Your trial just ended</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  You're back on the {tierLabel} plan. Pick what you want to keep active.
                </p>
              </div>
            </div>
            {mode === 'pick' && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {mode === 'choose' ? (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              Your data is safe. Nothing is deleted. You can either upgrade to keep everything running, or pick what stays active and put the rest into read-only archive.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={onUpgrade}
                className="text-left p-4 rounded-xl border-2 border-yellow-400 bg-yellow-50 hover:bg-yellow-100 transition-colors group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-900">Keep everything active</span>
                  <ArrowRight className="w-4 h-4 text-gray-700 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xs text-gray-700">Upgrade to Grower. From $5/month on yearly billing.</p>
              </button>

              <button
                onClick={() => setMode('pick')}
                className="text-left p-4 rounded-xl border border-gray-300 hover:border-gray-400 transition-colors group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-900">Pick what stays active</span>
                  <ArrowRight className="w-4 h-4 text-gray-500 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xs text-gray-600">Others go read-only. You can still see them.</p>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <p className="text-xs text-gray-600">
              {tierLabel} allows {limits.farm} farm{limits.farm !== 1 ? 's' : ''}, {limits.flock} active flock{limits.flock !== 1 ? 's' : ''} per farm, and {limits.team_member} team member{limits.team_member !== 1 ? 's' : ''}.
            </p>

            {grouped.farm.length > 0 && (
              <SelectionGroup
                title={`Farms (${farmCount} / ${limits.farm} active)`}
                items={grouped.farm}
                selected={selected}
                onToggle={toggle}
                overLimit={overFarmLimit}
              />
            )}
            {grouped.flock.length > 0 && (
              <SelectionGroup
                title={`Flocks (${flockCount} / ${limits.flock} active)`}
                items={grouped.flock}
                selected={selected}
                onToggle={toggle}
                overLimit={overFlockLimit}
              />
            )}
            {grouped.team_member.length > 0 && (
              <SelectionGroup
                title={`Team members (${teamCount} / ${limits.team_member} active)`}
                items={grouped.team_member}
                selected={selected}
                onToggle={toggle}
                overLimit={overTeamLimit}
              />
            )}

            {stillOverLimit && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                You're still over the {tierLabel} limit. Deselect more items, or upgrade to keep everything.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {mode === 'pick' && (
          <div className="p-6 border-t border-gray-200 flex items-center justify-between gap-3">
            <button
              onClick={() => setMode('choose')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={onUpgrade}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                Upgrade instead
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving || stillOverLimit || totalKept === 0}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save selection'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectionGroup({
  title,
  items,
  selected,
  onToggle,
  overLimit,
}: {
  title: string;
  items: OverflowItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  overLimit: boolean;
}) {
  return (
    <div>
      <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${overLimit ? 'text-red-700' : 'text-gray-700'}`}>
        {title}
      </h3>
      <div className="space-y-1.5">
        {items.map(item => {
          const isSelected = selected.has(item.id);
          return (
            <label
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isSelected
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(item.id)}
                className="w-4 h-4 rounded text-gray-900 focus:ring-gray-900"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm truncate">{item.name}</div>
                {item.context && (
                  <div className="text-xs text-gray-500 truncate">{item.context}</div>
                )}
              </div>
              <span className={`text-xs font-medium ${isSelected ? 'text-gray-900' : 'text-gray-400'}`}>
                {isSelected ? 'Active' : 'Archive'}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export type { OverflowItem };
