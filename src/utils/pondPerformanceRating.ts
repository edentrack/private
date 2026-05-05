/**
 * Pond performance rating — Phase B Step 19.
 *
 * Composite 1–5 star rating built from 4 sub-scores:
 *   1. Growth — current ABW vs target weight at the same age
 *   2. Survival — alive count vs initial count
 *   3. FCR — feed conversion ratio vs species ideal
 *   4. Density — current stocking density vs species recommended max
 *
 * Each sub-score is normalised 0–1, then averaged and converted to stars.
 * The breakdown is exposed so the UI can show *why* a pond is rated low.
 */

/**
 * Inline copy of the species union — when the parent PR (`phase-b-fish-utilities`)
 * lands first, this can be replaced with `import type { FishSpeciesType } from './fcrAquaculture'`.
 */
type FishSpeciesType = 'Tilapia' | 'Catfish' | 'Clarias' | 'Other Fish';

export interface PondPerformanceInput {
  species: FishSpeciesType;
  currentWeek: number;
  /** Current ABW in grams. */
  currentAbwG: number | null;
  /** Target ABW for currentWeek (use lookup table or species default). */
  targetAbwG: number | null;
  initialCount: number;
  currentCount: number;
  /** FCR computed externally; null if no feed/biomass-gain data yet. */
  fcr: number | null;
  /** fish/m²; null if pond size unknown. */
  density: number | null;
}

export interface SubScore {
  /** 0–1, where 1 is excellent. */
  score: number;
  /** 0–5 stars contribution from this dimension. */
  stars: number;
  label: string;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
}

export interface PondPerformanceResult {
  /** 0–5, may be fractional. */
  stars: number;
  /** 0–5, rounded for display ('★★★★☆'). */
  starsRounded: number;
  growth: SubScore;
  survival: SubScore;
  fcr: SubScore;
  density: SubScore;
}

const SPECIES_FCR_IDEAL: Record<FishSpeciesType, number> = {
  Tilapia: 1.6,
  Catfish: 1.8,
  Clarias: 1.3,
  'Other Fish': 1.8,
};
const SPECIES_DENSITY_IDEAL: Record<FishSpeciesType, number> = {
  Tilapia: 5,
  Catfish: 30,
  Clarias: 40,
  'Other Fish': 8,
};

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}

function scoreToLabel(s: number): SubScore['status'] {
  if (s >= 0.9) return 'excellent';
  if (s >= 0.75) return 'good';
  if (s >= 0.5) return 'fair';
  return 'poor';
}

export function calculatePondPerformance(input: PondPerformanceInput): PondPerformanceResult {
  // 1. Growth: actual / target ABW. 100% = ideal; >100% = above target (capped at 1.1).
  let growth: SubScore;
  if (input.currentAbwG && input.targetAbwG && input.targetAbwG > 0) {
    const ratio = input.currentAbwG / input.targetAbwG;
    const score = clamp(ratio / 1.1); // ratio of 1.1 = max stars; ratio of 0.5 = ~0.45 score
    growth = {
      score,
      stars: score * 5,
      label: `${(ratio * 100).toFixed(0)}% of week ${input.currentWeek} target`,
      status: scoreToLabel(score),
    };
  } else {
    growth = { score: 0, stars: 0, label: 'No weight target set', status: 'unknown' };
  }

  // 2. Survival
  let survival: SubScore;
  if (input.initialCount > 0) {
    const survivalRate = input.currentCount / input.initialCount;
    const score = clamp(survivalRate);
    survival = {
      score,
      stars: score * 5,
      label: `${(survivalRate * 100).toFixed(1)}% survival`,
      status: scoreToLabel(score),
    };
  } else {
    survival = { score: 0, stars: 0, label: 'No initial count', status: 'unknown' };
  }

  // 3. FCR — score = ideal / actual, capped at 1.
  let fcr: SubScore;
  if (input.fcr !== null && input.fcr > 0) {
    const ideal = SPECIES_FCR_IDEAL[input.species];
    const score = clamp(ideal / input.fcr);
    fcr = {
      score,
      stars: score * 5,
      label: `FCR ${input.fcr.toFixed(2)} (ideal ${ideal})`,
      status: scoreToLabel(score),
    };
  } else {
    fcr = { score: 0, stars: 0, label: 'FCR not yet computable', status: 'unknown' };
  }

  // 4. Density — score = 1 if at or below ideal, drops linearly past 2× ideal.
  let density: SubScore;
  if (input.density !== null && input.density > 0) {
    const ideal = SPECIES_DENSITY_IDEAL[input.species];
    let score: number;
    if (input.density <= ideal) score = 1;
    else if (input.density <= ideal * 2) score = 1 - (input.density - ideal) / ideal;
    else score = 0;
    density = {
      score,
      stars: score * 5,
      label: `${input.density.toFixed(1)} fish/m² (ideal ≤ ${ideal})`,
      status: scoreToLabel(score),
    };
  } else {
    density = { score: 0, stars: 0, label: 'Pond size unknown', status: 'unknown' };
  }

  // Composite — average over only the dimensions we have data for.
  const dims = [growth, survival, fcr, density].filter(d => d.status !== 'unknown');
  const avg = dims.length > 0 ? dims.reduce((s, d) => s + d.score, 0) / dims.length : 0;
  const stars = avg * 5;

  return {
    stars,
    starsRounded: Math.round(stars),
    growth,
    survival,
    fcr,
    density,
  };
}
