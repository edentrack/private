/**
 * Aquaculture Feed Conversion Ratio (FCR) — Phase B Step 10.
 *
 * FCR = total feed used (kg) / biomass gained (kg)
 *
 * For fish, FCR is THE headline efficiency metric — feed is the largest
 * variable cost (~60% of operating cost). Lower is better.
 *
 * Healthy ranges (kg feed / kg fish gained):
 *   - Tilapia: 1.4–1.8 excellent, 1.8–2.5 acceptable, >2.5 needs investigation
 *   - Catfish (intensive): 1.5–2.0 excellent, 2.0–2.8 acceptable, >2.8 needs investigation
 *   - Clarias: 1.0–1.5 excellent (very efficient), 1.5–2.0 acceptable
 *
 * Biomass gained = (current_avg_weight × current_count) − (initial_avg_weight × initial_count)
 * If we don't have an initial sample, use stocking weight × initial_count.
 */

export type FishSpeciesType = 'Tilapia' | 'Catfish' | 'Clarias' | 'Other Fish';

export interface FishFcrInput {
  /** kg of feed used in the period (sum of feed_givings / inventory_usage). */
  feedKg: number;
  /** kg of biomass gained in the period. */
  biomassGainedKg: number;
  /** Species, used to pick health thresholds. */
  species: FishSpeciesType;
}

export interface FishFcrResult {
  fcr: number | null;
  status: 'excellent' | 'acceptable' | 'high' | 'invalid';
  color: 'green' | 'amber' | 'red' | 'gray';
  label: string;
  /** Reason the result is null/invalid (only set when fcr is null). */
  reason?: string;
}

interface SpeciesThresholds {
  excellentMax: number;
  acceptableMax: number;
}

const SPECIES_FCR_THRESHOLDS: Record<FishSpeciesType, SpeciesThresholds> = {
  Tilapia: { excellentMax: 1.8, acceptableMax: 2.5 },
  Catfish: { excellentMax: 2.0, acceptableMax: 2.8 },
  Clarias: { excellentMax: 1.5, acceptableMax: 2.0 },
  'Other Fish': { excellentMax: 2.0, acceptableMax: 2.8 },
};

export function calculateFishFCR({
  feedKg,
  biomassGainedKg,
  species,
}: FishFcrInput): FishFcrResult {
  if (feedKg <= 0) {
    return {
      fcr: null,
      status: 'invalid',
      color: 'gray',
      label: ' - ',
      reason: 'No feed logged in period',
    };
  }
  if (biomassGainedKg <= 0) {
    return {
      fcr: null,
      status: 'invalid',
      color: 'gray',
      label: ' - ',
      reason: 'No biomass gain (need 2+ weight samples)',
    };
  }

  const fcr = feedKg / biomassGainedKg;
  return classifyFishFCR(fcr, species);
}

export function classifyFishFCR(fcr: number, species: FishSpeciesType): FishFcrResult {
  const thresholds = SPECIES_FCR_THRESHOLDS[species];

  if (fcr <= thresholds.excellentMax) {
    return { fcr, status: 'excellent', color: 'green', label: 'Excellent' };
  }
  if (fcr <= thresholds.acceptableMax) {
    return { fcr, status: 'acceptable', color: 'amber', label: 'Acceptable' };
  }
  return {
    fcr,
    status: 'high',
    color: 'red',
    label: 'High - investigate feeding plan',
  };
}

export function formatFCR(fcr: number | null): string {
  if (fcr === null) return '—';
  return fcr.toFixed(2);
}
