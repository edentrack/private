/**
 * EdenFarmSelector — a dropdown next to the Eden avatar that scopes the
 * conversation to a single farm OR to "All my farms" (cross-farm mode).
 *
 * Cross-farm mode disambiguates writes: Eden must ask which farm before
 * generating a [LOG] block. See docs/EDEN_PER_FARM_CHAT.md.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe, Fish, Wheat, Rabbit, Check } from 'lucide-react';
import type { OwnedFarm } from '../../contexts/authContextRef';
import type { FarmKind } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  farms: OwnedFarm[];
  /** When the user is in single-farm mode this is the active farm id; in cross-farm mode it's null. */
  selectedFarmId: string | null;
  /** True when in cross-farm mode. */
  crossFarm: boolean;
  onSelectFarm: (farmId: string) => void;
  onSelectAllFarms: () => void;
  /** Optional small badge to show, e.g. message count for the current scope. */
  rightAccessory?: React.ReactNode;
}

function speciesIcon(kind: FarmKind | undefined) {
  switch (kind) {
    case 'aquaculture':
      return <Fish className="w-3.5 h-3.5 text-blue-600" />;
    case 'rabbits':
      return <Rabbit className="w-3.5 h-3.5 text-amber-700" />;
    case 'poultry':
    default:
      return <Wheat className="w-3.5 h-3.5 text-amber-600" />;
  }
}

export function EdenFarmSelector({
  farms,
  selectedFarmId,
  crossFarm,
  onSelectFarm,
  onSelectAllFarms,
  rightAccessory,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { language } = useLanguage();
  const isFr = language === 'fr';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const activeFarm = !crossFarm && selectedFarmId
    ? farms.find((f) => f.id === selectedFarmId)
    : null;

  const showCrossFarm = farms.length >= 2;

  const buttonLabel = crossFarm
    ? (isFr ? 'Toutes mes fermes' : 'All my farms')
    : activeFarm?.name ?? (farms[0]?.name ?? (isFr ? 'Sélectionner une ferme' : 'Select farm'));

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm text-gray-800 max-w-[200px]"
        aria-label={isFr ? 'Portée du chat Eden' : 'Eden chat scope'}
      >
        {crossFarm ? (
          <Globe className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
        ) : (
          speciesIcon(activeFarm?.farm_type)
        )}
        <span className="truncate font-medium">{buttonLabel}</span>
        {rightAccessory}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full mt-1 left-0 min-w-[240px] z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
            {isFr ? 'Portée de la conversation' : 'Conversation scope'}
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {farms.map((farm) => {
              const active = !crossFarm && selectedFarmId === farm.id;
              return (
                <li key={farm.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectFarm(farm.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                      active ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    {speciesIcon(farm.farm_type)}
                    <span className="truncate flex-1">{farm.name}</span>
                    {active && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
            {showCrossFarm && (
              <>
                <li className="my-1 border-t border-gray-100" />
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAllFarms();
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                      crossFarm
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{isFr ? 'Toutes mes fermes' : 'All my farms'}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {isFr ? 'Comparer entre les fermes · Eden demande laquelle utiliser' : 'Compare across farms · Eden asks which to log to'}
                      </div>
                    </div>
                    {crossFarm && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default EdenFarmSelector;
