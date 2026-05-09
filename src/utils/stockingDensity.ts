/**
 * Stocking density warnings — Phase B Step 12.
 *
 * Density = fish count / pond area (m²). Too high = stress, low oxygen,
 * disease, slow growth. Too low = wasted capital and feed efficiency.
 *
 * Thresholds (fish/m² for static earthen ponds without aeration —
 * with aeration, double these). Adjust per region/system.
 */

import type { FishSpeciesType } from './fcrAquaculture';

export interface DensityThresholds {
  ideal: number;       // upper bound of "ideal" range
  acceptable: number;  // upper bound of "acceptable"
  stressed: number;    // upper bound of "stressed"; above = crisis
}

const DENSITY_THRESHOLDS: Record<FishSpeciesType, DensityThresholds> = {
  Tilapia: { ideal: 5, acceptable: 10, stressed: 15 },
  Catfish: { ideal: 20, acceptable: 50, stressed: 100 },
  Clarias: { ideal: 25, acceptable: 60, stressed: 120 },
  'Other Fish': { ideal: 5, acceptable: 10, stressed: 15 },
};

export interface DensityInput {
  species: FishSpeciesType;
  count: number;
  pondSizeSqm: number;
  /** Pond has paddlewheel/diffuser aeration — doubles tolerated density. */
  aerated?: boolean;
}

export interface DensityResult {
  /** fish/m². 0 if pondSizeSqm is missing. */
  density: number;
  status: 'ideal' | 'acceptable' | 'stressed' | 'crisis' | 'unknown';
  color: 'green' | 'amber' | 'red' | 'gray';
  label: string;
  message: string;
  /** Recommended max density for this pond. */
  maxRecommended: number;
}

export function calculateStockingDensity({
  species,
  count,
  pondSizeSqm,
  aerated = false,
}: DensityInput): DensityResult {
  if (!pondSizeSqm || pondSizeSqm <= 0) {
    return {
      density: 0,
      status: 'unknown',
      color: 'gray',
      label: ' - ',
      message: 'Set pond size (m²) to track stocking density.',
      maxRecommended: 0,
    };
  }

  const density = count / pondSizeSqm;
  const base = DENSITY_THRESHOLDS[species];
  const factor = aerated ? 2 : 1;
  const t = {
    ideal: base.ideal * factor,
    acceptable: base.acceptable * factor,
    stressed: base.stressed * factor,
  };

  if (density <= t.ideal) {
    return {
      density,
      status: 'ideal',
      color: 'green',
      label: 'Ideal',
      message: `${density.toFixed(1)} fish/m² - comfortable for ${species.toLowerCase()}${aerated ? ' (aerated)' : ''}.`,
      maxRecommended: t.acceptable,
    };
  }
  if (density <= t.acceptable) {
    return {
      density,
      status: 'acceptable',
      color: 'green',
      label: 'Acceptable',
      message: `${density.toFixed(1)} fish/m² - within healthy range. Watch DO and ammonia.`,
      maxRecommended: t.acceptable,
    };
  }
  if (density <= t.stressed) {
    return {
      density,
      status: 'stressed',
      color: 'amber',
      label: 'Stressed',
      message: `${density.toFixed(1)} fish/m² exceeds the recommended ${t.acceptable.toFixed(0)} for ${species.toLowerCase()}. Increase aeration, water exchange, or reduce density.`,
      maxRecommended: t.acceptable,
    };
  }
  return {
    density,
    status: 'crisis',
    color: 'red',
    label: 'Crisis',
    message: `${density.toFixed(1)} fish/m² is critically high (max safe ${t.stressed.toFixed(0)}). Mortality and disease risk are very high - consider emergency partial harvest or splitting the pond.`,
    maxRecommended: t.acceptable,
  };
}
