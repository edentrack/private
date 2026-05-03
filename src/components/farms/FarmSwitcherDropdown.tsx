import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Plus, Fish, Wheat } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getMaxFarms } from '../../utils/planGating';
import type { OwnedFarm } from '../../contexts/authContextRef';
import type { FarmKind } from '../../types/database';

interface FarmSwitcherDropdownProps {
  onAddFarm: () => void;
}

function FarmTypeIcon({ type, className }: { type: FarmKind | undefined; className?: string }) {
  if (type === 'aquaculture') return <Fish className={className ?? 'w-3 h-3'} />;
  return <Wheat className={className ?? 'w-3 h-3'} />;
}

export function FarmSwitcherDropdown({ onAddFarm }: FarmSwitcherDropdownProps) {
  const { currentFarm, allFarms, switchFarm, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
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

  const handleSwitch = async (farm: OwnedFarm) => {
    if (farm.id === currentFarm?.id) { setOpen(false); return; }
    setSwitching(farm.id);
    await switchFarm(farm.id);
    setSwitching(null);
    setOpen(false);
  };

  const farmTypeBadge = (type: FarmKind | undefined) => {
    if (type === 'aquaculture') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
          <Fish className="w-2.5 h-2.5" /> Fish
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
          {allFarms.map((farm) => {
            const isActive = farm.id === currentFarm?.id;
            const isLoading = switching === farm.id;
            return (
              <button
                key={farm.id}
                onClick={() => handleSwitch(farm)}
                disabled={isLoading}
                className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left ${isLoading ? 'opacity-60' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  farm.farm_type === 'aquaculture' ? 'bg-blue-50' : 'bg-amber-50'
                }`}>
                  <FarmTypeIcon type={farm.farm_type} className={`w-4 h-4 ${farm.farm_type === 'aquaculture' ? 'text-blue-500' : 'text-amber-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                    {farm.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {farmTypeBadge(farm.farm_type)}
                    {farm.location && (
                      <span className="text-[9px] text-gray-400 truncate">{farm.location}</span>
                    )}
                  </div>
                </div>
                {isActive && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </button>
            );
          })}

          <div className="border-t border-gray-100 my-1" />

          <button
            onClick={() => { setOpen(false); onAddFarm(); }}
            disabled={!canAddMore}
            className={`w-full px-3 py-2.5 flex items-center gap-3 transition-colors text-left ${canAddMore ? 'hover:bg-gray-50' : 'opacity-40 cursor-not-allowed'}`}
          >
            <div className="w-8 h-8 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-600">Add a new farm</span>
            </div>
            <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0 tabular-nums">
              {allFarms.length}/{maxFarms}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
