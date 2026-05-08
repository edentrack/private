/**
 * EdenEmptyState — personalized greeting + Haiku-generated suggestion chips.
 *
 * Replaces the old static "Hey, I'm Eden!" + hardcoded suggestion list with
 * a chat surface that knows who the user is and what's going on at their farm.
 *
 * Per Phase 2 of CLAUDE_CODE_AUTONOMOUS_ROADMAP.md.
 */

import { FileSpreadsheet, Lightbulb, Loader2 } from 'lucide-react';
import { EdenAvatarAnimated } from './EdenAvatarAnimated';
import { useEdenChips } from '../../hooks/useEdenChips';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  /** First name to address the user with. Falls back to "there". */
  ownerFirstName: string;
  /** Active farm — drives chip personalization. Null in cross-farm mode. */
  farmId: string | null;
  farmName: string | null;
  /** Used for static-fallback chip selection if Haiku call fails. */
  farmType: 'poultry' | 'aquaculture' | 'rabbits' | string | null;
  /** Short status line woven into the greeting (e.g. "Pond 1 is on day 87 of 150"). */
  statusLine?: string | null;
  /** True when the user is in "All my farms" cross-farm mode. */
  crossFarm?: boolean;
  /** Tap a chip = autosend that text. */
  onChipClick: (label: string) => void;
  onCsvImport: () => void;
}

export function EdenEmptyState({
  ownerFirstName,
  farmId,
  farmName,
  farmType,
  statusLine,
  crossFarm,
  onChipClick,
  onCsvImport,
}: Props) {
  const { chips, loading } = useEdenChips(crossFarm ? null : farmId, farmType);
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const greetingHeadline = crossFarm
    ? (isFr
        ? `Salut ${ownerFirstName}, vous discutez sur toutes vos fermes.`
        : `Hey ${ownerFirstName}, you're chatting across all your farms.`)
    : farmName
    ? (isFr
        ? `Salut ${ownerFirstName}, ${farmName} est prête quand vous l'êtes.`
        : `Hey ${ownerFirstName}, ${farmName} is ready when you are.`)
    : (isFr
        ? `Salut ${ownerFirstName}, je suis Eden.`
        : `Hey ${ownerFirstName}, I'm Eden.`);

  const greetingBody = crossFarm
    ? (isFr
        ? "Posez-moi n'importe quelle question sur n'importe quelle ferme — je confirmerai toujours avant d'enregistrer des changements."
        : "Ask me anything about any farm — I'll always confirm before logging changes.")
    : statusLine
    ? statusLine
    : (isFr ? "Avec quoi puis-je vous aider aujourd'hui ?" : 'What can I help with today?');

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="mb-4">
        <EdenAvatarAnimated size="lg" expanded />
      </div>
      <h2 className="text-xl font-bold text-agri-brown-700 mb-1">{greetingHeadline}</h2>
      <p className="text-gray-600 mb-6 max-w-md text-sm">{greetingBody}</p>

      <div className="w-full max-w-2xl">
        <p className="text-sm font-medium text-gray-700 mb-3 flex items-center justify-center gap-1.5">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          {isFr ? 'Essayez de demander' : 'Try asking'}
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {chips.map((chip, idx) => (
            <button
              key={`${idx}-${chip.label}`}
              onClick={() => onChipClick(chip.label)}
              className="group text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors text-sm text-gray-800"
            >
              <span className="mr-2 text-base" aria-hidden>
                {chip.icon}
              </span>
              <span className="group-hover:text-gray-900">{chip.label}</span>
            </button>
          ))}
          <button
            onClick={onCsvImport}
            className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors text-sm text-gray-800"
          >
            <FileSpreadsheet className="w-4 h-4 inline mr-2 text-emerald-600" />
            {isFr ? 'Importer des données historiques depuis un fichier CSV' : 'Import historical data from a CSV file'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EdenEmptyState;
