/**
 * EdenHeader — extracted from AIAssistantPage.
 *
 * The header strip at the top of Eden chat:
 *   [avatar]  Eden — tagline                 [farm-selector] [usage] [clear]
 *
 * Per docs/EDEN_AI_REDESIGN.md + Brief #2 (#EDEN-1 component
 * decomposition slice). One step toward shrinking AIAssistantPage from
 * its current ~2,100 lines down to the ~300-line orchestration target.
 */

import { EdenAvatarAnimated } from './EdenAvatarAnimated';
import { EdenFarmSelector } from './EdenFarmSelector';
import { useLanguage } from '../../contexts/LanguageContext';
import type { OwnedFarm } from '../../contexts/authContextRef';

interface UsageInfo {
  used: number;
  cap: number;
  tier: string;
}

interface Props {
  /** Species id from useFarmSpecies — drives the tagline copy. */
  speciesId: 'poultry' | 'aquaculture' | 'rabbits' | string;
  allFarms: OwnedFarm[];
  currentFarmId: string | null;
  crossFarm: boolean;
  onSelectFarm: (farmId: string) => void;
  onSelectAllFarms: () => void;
  /** Tier+usage pill on the right; pass null/undefined to hide. */
  usageInfo: UsageInfo | null;
  /** Show the Clear Chat button when there's anything to clear. */
  showClear: boolean;
  onClear: () => void;
}

function taglineFor(species: Props['speciesId'], isFr: boolean): string {
  if (species === 'aquaculture') {
    return isFr
      ? "Santé de l'étang · Qualité de l'eau · ICA · Diagnostics · Import de données"
      : 'Pond health · Water quality · FCR · Diagnostics · Data import';
  }
  if (species === 'rabbits') {
    return isFr
      ? 'Santé du clapier · Alimentation · Suivi de croissance · Diagnostics · Import de données'
      : 'Hutch health · Feed · Growth tracking · Diagnostics · Data import';
  }
  return isFr
    ? 'Performance de la ferme · Santé du troupeau · Diagnostics · Import de données'
    : 'Farm performance · Flock health · Diagnostics · Data import';
}

function usageColorClass(used: number, cap: number): string {
  if (used >= cap) return 'bg-red-100 text-red-700';
  if (used >= cap * 0.8) return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-500';
}

export function EdenHeader({
  speciesId,
  allFarms,
  currentFarmId,
  crossFarm,
  onSelectFarm,
  onSelectAllFarms,
  usageInfo,
  showClear,
  onClear,
}: Props) {
  const { language } = useLanguage();
  const isFr = language === 'fr';
  // Mobile compaction (May 2026 phone view fix):
  // - Smaller avatar + tighter padding below sm:
  // - Hide the tagline subtitle entirely below sm — it truncates to
  //   "Farm performa…" on a phone, which looked broken. Tagline only
  //   adds useful context on tablet/desktop where there's room.
  // - Compact text on the Clear Chat / usage pill so they don't
  //   word-wrap into a second row when both are visible.
  return (
    <div data-tour="ai-header" className="flex-shrink-0 bg-white border-b border-gray-200 px-3 py-2 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <EdenAvatarAnimated size="md" />
        </div>
        <div className="sm:hidden">
          <EdenAvatarAnimated size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-agri-brown-700 leading-tight">Eden</h1>
          <p className="hidden sm:block text-sm text-gray-500 truncate">{taglineFor(speciesId, isFr)}</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          {allFarms && allFarms.length > 0 && (
            <EdenFarmSelector
              farms={allFarms}
              selectedFarmId={crossFarm ? null : currentFarmId}
              crossFarm={crossFarm}
              onSelectFarm={onSelectFarm}
              onSelectAllFarms={onSelectAllFarms}
            />
          )}
          {usageInfo && (
            <div className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium ${usageColorClass(usageInfo.used, usageInfo.cap)}`}>
              {usageInfo.tier === 'free'
                ? (isFr ? `${usageInfo.used}/${usageInfo.cap}` : `${usageInfo.used}/${usageInfo.cap}`)
                : `${usageInfo.used}/${usageInfo.cap === 99999 ? '∞' : usageInfo.cap}`}
            </div>
          )}
          {showClear && (
            <button
              onClick={onClear}
              className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title={isFr ? 'Effacer la discussion' : 'Clear Chat'}
            >
              {isFr ? 'Effacer' : 'Clear'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EdenHeader;
