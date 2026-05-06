/**
 * EdenLogActionCard — the redesigned [LOG] confirmation card.
 *
 * Per Phase 2 design decision #1: slim accent stripe + white fill.
 * The stripe color carries the species (or severity); the body stays
 * readable on white. Confirmation cards are visually the most distinct
 * element on the screen, so even a tired farmer at 5am can't accidentally
 * confirm something they didn't read.
 */

import { CheckCircle, X, Loader2, ShieldCheck } from 'lucide-react';

type Tone = 'fish' | 'rabbit' | 'poultry' | 'neutral';

const TONE_STRIPE: Record<Tone, string> = {
  fish: 'bg-blue-500',
  rabbit: 'bg-amber-600',
  poultry: 'bg-emerald-600',
  neutral: 'bg-gray-400',
};

const TONE_BUTTON: Record<Tone, string> = {
  fish: 'bg-blue-600 hover:bg-blue-700',
  rabbit: 'bg-amber-600 hover:bg-amber-700',
  poultry: 'bg-emerald-600 hover:bg-emerald-700',
  neutral: 'bg-gray-700 hover:bg-gray-800',
};

const TONE_EMOJI: Record<Tone, string> = {
  fish: '🐠',
  rabbit: '🐰',
  poultry: '🐔',
  neutral: '🌱',
};

function toneFor(species: string | null | undefined): Tone {
  if (species === 'aquaculture') return 'fish';
  if (species === 'rabbits') return 'rabbit';
  if (species === 'poultry') return 'poultry';
  return 'neutral';
}

interface Props {
  /** Species of the destination farm — drives the stripe color & emoji. */
  destinationSpecies: string | null | undefined;
  /** Destination farm name; only shown when in cross-farm mode. */
  destinationFarmName?: string | null;
  /** True when conversation is in "All my farms" mode. */
  crossFarm: boolean;
  /** Plain-text summary of what will be saved (one line). */
  actionSummary: string;
  /** State machine — which buttons / state to show. */
  status: 'pending' | 'saving' | 'saved' | 'error';
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EdenLogActionCard({
  destinationSpecies,
  destinationFarmName,
  crossFarm,
  actionSummary,
  status,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
  const tone = toneFor(destinationSpecies);
  const stripe = TONE_STRIPE[tone];
  const buttonClass = TONE_BUTTON[tone];
  const emoji = TONE_EMOJI[tone];

  const showFarmHeader = crossFarm && destinationFarmName;

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
      {/* Slim accent stripe — species color */}
      <div className={`h-1 w-full ${stripe}`} aria-hidden />

      {showFarmHeader && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <span className="text-base" aria-hidden>
            {emoji}
          </span>
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Save to {destinationFarmName}
          </span>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="flex items-start gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-900 break-words">{actionSummary}</div>
        </div>

        {status === 'saved' && (
          <p className="text-sm text-emerald-700 flex items-center gap-1.5 font-medium">
            <CheckCircle className="w-4 h-4" />
            Saved to your farm records
          </p>
        )}

        {status === 'saving' && (
          <p className="text-sm text-gray-600 flex items-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving…
          </p>
        )}

        {status === 'pending' && (
          <>
            {errorMessage && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mb-2 break-words">
                Save failed: {errorMessage}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={onConfirm}
                className={`flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 ${buttonClass} text-white rounded-xl text-sm font-semibold shadow-sm transition-colors`}
              >
                <CheckCircle className="w-4 h-4" />
                {crossFarm && destinationFarmName ? `Save to ${destinationFarmName}` : 'Confirm save'}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              You can undo within 24 hours from your activity log.
            </p>
          </>
        )}

        {status === 'error' && errorMessage && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mt-1">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

export default EdenLogActionCard;
