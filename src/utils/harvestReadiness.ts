/**
 * Fish harvest readiness calculator — Phase B Step 11.
 *
 * For each species, market-ready weight varies by region. Defaults below are
 * tuned for African mid-market (Nigeria, Cameroon, Kenya, Ghana retail).
 * Override per-pond when you know your buyer's spec.
 *
 * Output: a status, a days-to-harvest projection at the current SGR, and a
 * recommendation string the dashboard / Eden AI can echo verbatim.
 */

import type { FishSpeciesType } from './fcrAquaculture';

export interface SpeciesHarvestSpec {
  /** Default target weight in grams for mid-market harvest. */
  targetWeightG: number;
  /** Earliest week the fish should be considered for harvest. */
  earliestWeek: number;
  /** Latest week before holding cost erodes margin. */
  latestWeek: number;
  /** Plain-language label of the target. */
  description: string;
}

export const FISH_HARVEST_SPECS: Record<FishSpeciesType, SpeciesHarvestSpec> = {
  Tilapia: {
    targetWeightG: 400,
    earliestWeek: 16,
    latestWeek: 24,
    description: 'mid-size table fish (300–500 g)',
  },
  Catfish: {
    targetWeightG: 1000,
    earliestWeek: 18,
    latestWeek: 26,
    description: 'whole-fish market (800 g–1.2 kg)',
  },
  Clarias: {
    targetWeightG: 500,
    earliestWeek: 16,
    latestWeek: 22,
    description: 'fillet/dried market (400–600 g)',
  },
  'Other Fish': {
    targetWeightG: 500,
    earliestWeek: 18,
    latestWeek: 26,
    description: 'mid-size harvest',
  },
};

export interface HarvestReadinessInput {
  species: FishSpeciesType;
  /** Current week of the cycle. */
  currentWeek: number;
  /** Current average body weight in grams. */
  currentAbwG: number;
  /** Specific growth rate in %/day (use sgrAnalysis.calculateSGR first). */
  sgrPercent: number;
  /** Optional override of the species default target. */
  customTargetG?: number;
}

export interface HarvestReadinessResult {
  status:
    | 'too-early'
    | 'approaching'
    | 'ready'
    | 'overdue'
    | 'unknown';
  /** Estimated days until current ABW reaches target weight at current SGR. */
  daysToTarget: number | null;
  /** Recommended action label. */
  recommendation: string;
  /** Detailed message the dashboard can show. */
  message: string;
  /** Tailwind color token. */
  color: 'gray' | 'amber' | 'green' | 'red';
  /** The target weight used (after applying customTargetG override if any). */
  targetWeightG: number;
}

/**
 * Compute days from currentAbwG to targetWeightG at the given SGR.
 * SGR is the *exponential* growth rate, so:
 *   target = current * exp(sgr/100 * days)
 * → days = ln(target/current) / (sgr/100)
 */
function projectDaysToTarget(
  currentG: number,
  targetG: number,
  sgrPercent: number,
): number | null {
  if (currentG <= 0 || targetG <= 0) return null;
  if (currentG >= targetG) return 0;
  if (sgrPercent <= 0) return null; // can't project with no growth
  return Math.ceil(Math.log(targetG / currentG) / (sgrPercent / 100));
}

export function calculateHarvestReadiness({
  species,
  currentWeek,
  currentAbwG,
  sgrPercent,
  customTargetG,
}: HarvestReadinessInput): HarvestReadinessResult {
  const spec = FISH_HARVEST_SPECS[species];
  const targetG = customTargetG && customTargetG > 0 ? customTargetG : spec.targetWeightG;

  if (!currentAbwG || currentAbwG <= 0) {
    return {
      status: 'unknown',
      daysToTarget: null,
      recommendation: 'Take a weight sample to assess harvest readiness.',
      message: 'No weight sample yet - sample 5–10 fish to enable this calculation.',
      color: 'gray',
      targetWeightG: targetG,
    };
  }

  const days = projectDaysToTarget(currentAbwG, targetG, sgrPercent);
  const reachedTarget = currentAbwG >= targetG;

  // Decision tree
  if (currentWeek < spec.earliestWeek && !reachedTarget) {
    return {
      status: 'too-early',
      daysToTarget: days,
      recommendation: 'Keep growing',
      message: `Fish are still in grow-out phase. ${spec.description} target around week ${spec.earliestWeek}–${spec.latestWeek}. Currently ${currentAbwG.toFixed(0)} g vs ${targetG} g target.`,
      color: 'gray',
      targetWeightG: targetG,
    };
  }

  if (reachedTarget) {
    if (currentWeek > spec.latestWeek) {
      return {
        status: 'overdue',
        daysToTarget: 0,
        recommendation: 'Harvest now - past optimal',
        message: `Fish are at or above target weight (${currentAbwG.toFixed(0)} g ≥ ${targetG} g) and past week ${spec.latestWeek}. Holding longer eats into margin via feed cost without much weight gain.`,
        color: 'red',
        targetWeightG: targetG,
      };
    }
    return {
      status: 'ready',
      daysToTarget: 0,
      recommendation: 'Harvest now',
      message: `Fish have reached the ${targetG} g target (current ${currentAbwG.toFixed(0)} g). Within optimal harvest window (week ${spec.earliestWeek}–${spec.latestWeek}).`,
      color: 'green',
      targetWeightG: targetG,
    };
  }

  // Within window but not at target yet
  if (days !== null && days <= 14) {
    return {
      status: 'approaching',
      daysToTarget: days,
      recommendation: `Harvest in ~${days} day${days === 1 ? '' : 's'}`,
      message: `Fish are within the harvest window. At current SGR ${sgrPercent.toFixed(1)}%/day, expect to hit ${targetG} g in about ${days} day${days === 1 ? '' : 's'}.`,
      color: 'amber',
      targetWeightG: targetG,
    };
  }

  if (days !== null) {
    return {
      status: 'too-early',
      daysToTarget: days,
      recommendation: 'Keep growing',
      message: `Currently ${currentAbwG.toFixed(0)} g, target ${targetG} g. At current SGR ${sgrPercent.toFixed(1)}%/day, ~${days} days to harvest weight.`,
      color: 'gray',
      targetWeightG: targetG,
    };
  }

  return {
    status: 'unknown',
    daysToTarget: null,
    recommendation: 'Need recent SGR data',
    message: 'Take a second weight sample to estimate growth rate.',
    color: 'gray',
    targetWeightG: targetG,
  };
}
