import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Fish, Wheat, Rabbit, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getMaxFarms } from '../../utils/planGating';
import type { FarmKind } from '../../types/database';

interface FarmSwitcherDropdownProps {
  onAddFarm: () => void;
}

function FarmTypeIcon({ type, className }: { type: FarmKind | undefined; className?: string }) {
  if (type === 'aquaculture') return <Fish className={className ?? 'w-3 h-3'} />;
  if (type === 'rabbits') return <Rabbit className={className ?? 'w-3 h-3'} />;
  return <Wheat className={className ?? 'w-3 h-3'} />;
}

export function FarmSwitcherDropdown({ onAddFarm }: FarmSwitcherDropdownProps) {
  const { currentFarm, allFarms, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const maxFarms = getMaxFarms(profile?.subscription_tier);
  const canAddMore = allFarms.length < maxFarms;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const farmTypeBadge = (type: FarmKind | undefined) => {
    if (type === 'aquaculture') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
          <Fish className="w-2.5 h-2.5" /> Fish
        </span>
      );
    }
    if (type === 'rabbits') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
          <Rabbit className="w-2.5 h-2.5" /> Rabbitry
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
        <Wheat className="w-2.5 h-2.5" /> Poultry
      </span>
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 hover:bg-white/40 rounded-lg px-1 py-0.5 transition-colors group"
      >
        <div className="flex items-center gap-1">
          <FarmTypeIcon type={currentFarm?.farm_type as FarmKind | undefined} className="w-2.5 h-2.5 text-gray-500 flex-shrink-0" />
          <p className="text-[8px] sm:text-[9px] text-gray-600 leading-tight truncate max-w-[80px] sm:max-w-[110px] md:max-w-[140px] font-medium">
            {currentFarm?.name || 'My Farm'}
          </p>
        </div>
        <ChevronDown className="w-2.5 h-2.5 text-gray-400 flex-shrink-0 group-hover:text-gray-600 transition-colors" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-scale-in">
          {/* Active farm display */}
          <div className="px-3 py-2.5 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              currentFarm?.farm_type === 'aquaculture' ? 'bg-blue-50' : currentFarm?.farm_type === 'rabbits' ? 'bg-emerald-50' : 'bg-amber-50'
            }`}>
              <FarmTypeIcon
                type={currentFarm?.farm_type as FarmKind | undefined}
                className={`w-4 h-4 ${currentFarm?.farm_type === 'aquaculture' ? 'text-blue-500' : currentFarm?.farm_type === 'rabbits' ? 'text-emerald-700' : 'text-amber-600'}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{currentFarm?.name || 'My Farm'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {farmTypeBadge(currentFarm?.farm_type as FarmKind | undefined)}
                {currentFarm?.location && (
                  <span className="text-[9px] text-gray-400 truncate">{currentFarm.location}</span>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 my-1" />

          {/* Add a new farm — always open the modal; modal handles the limit-reached state */}
          <button
            onClick={() => { setOpen(false); onAddFarm(); }}
            className={`w-full px-3 py-2.5 flex items-center gap-3 transition-colors text-left ${
              canAddMore ? 'hover:bg-gray-50' : 'hover:bg-amber-50'
            }`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              canAddMore
                ? 'border-2 border-dashed border-gray-200'
                : 'bg-amber-50'
            }`}>
              <Plus className={`w-4 h-4 ${canAddMore ? 'text-gray-400' : 'text-amber-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${canAddMore ? 'text-gray-600' : 'text-amber-600'}`}>
                {canAddMore ? 'Add a new farm' : 'Add a new farm'}
              </span>
              <p className="text-[9px] text-gray-400 mt-0.5">{allFarms.length} of {maxFarms} farms used</p>
            </div>
          </button>

          {/* Manage farms link */}
          {allFarms.length > 1 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setOpen(false); window.location.hash = '#/settings?tab=my-farms'; }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
              >
                <Settings className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">Manage farms</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
