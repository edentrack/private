/**
 * Kindling rate KPI — Phase C.
 *
 * For rabbit breeders, the headline efficiency metric is "kits weaned per
 * doe per year" — the rabbit equivalent of laying-rate for hens or FCR for
 * broilers. It captures both fertility (does kindling regularly) and
 * survival (kits making it to weaning).
 *
 * Formula: kindlingRate = (total_weaned_kits_in_period * 365 / period_days) / active_does
 *
 * Healthy ranges (commercial meat rabbit operations):
 *   - >40 weaned/doe/year: excellent
 *   - 30-40: good
 *   - 20-30: fair (room for improvement on fertility or survival)
 *   - <20: poor — diagnose: nutrition, breeding rest period, doe age,
 *     buck/doe ratio, kit survival, environmental stress
 *
 * Backyard / village production typically runs 15-25 weaned/doe/year and
 * intensive commercial pushes 50+.
 */

export interface KindlingRateInput {
  /** Total kits weaned in the measurement window. */
  weanedKits: number;
  /** Length of the measurement window in days. */
  periodDays: number;
  /** Number of active breeding does in the period. */
  activeDoes: number;
}

export interface KindlingRateResult {
  /** Annualised kits-weaned per doe. */
  kitsPerDoePerYear: number;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'invalid';
  color: 'green' | 'amber' | 'red' | 'gray';
  label: string;
  message: string;
}

export function calculateKindlingRate({
  weanedKits,
  periodDays,
  activeDoes,
}: KindlingRateInput): KindlingRateResult {
  if (activeDoes <= 0 || periodDays <= 0) {
    return {
      kitsPerDoePerYear: 0,
      status: 'invalid',
      color: 'gray',
      label: '—',
      message: 'Need active breeding does and a measurement window.',
    };
  }

  const annualisedKits = (weanedKits * 365) / periodDays;
  const kitsPerDoePerYear = annualisedKits / activeDoes;
  return classifyKindlingRate(kitsPerDoePerYear);
}

export function classifyKindlingRate(kitsPerDoePerYear: number): KindlingRateResult {
  if (kitsPerDoePerYear >= 40) {
    return {
      kitsPerDoePerYear,
      status: 'excellent',
      color: 'green',
      label: 'Excellent',
      message: `${kitsPerDoePerYear.toFixed(0)} kits/doe/year — top-tier efficiency.`,
    };
  }
  if (kitsPerDoePerYear >= 30) {
    return {
      kitsPerDoePerYear,
      status: 'good',
      color: 'green',
      label: 'Good',
      message: `${kitsPerDoePerYear.toFixed(0)} kits/doe/year — healthy commercial-tier output.`,
    };
  }
  if (kitsPerDoePerYear >= 20) {
    return {
      kitsPerDoePerYear,
      status: 'fair',
      color: 'amber',
      label: 'Fair',
      message: `${kitsPerDoePerYear.toFixed(0)} kits/doe/year — room to improve via tighter breeding rest period or kit survival.`,
    };
  }
  if (kitsPerDoePerYear > 0) {
    return {
      kitsPerDoePerYear,
      status: 'poor',
      color: 'red',
      label: 'Below benchmark',
      message: `${kitsPerDoePerYear.toFixed(0)} kits/doe/year — investigate nutrition, doe age, buck-to-doe ratio, weaning survival.`,
    };
  }
  return {
    kitsPerDoePerYear: 0,
    status: 'poor',
    color: 'red',
    label: 'No production',
    message: 'No kits weaned in the measurement window.',
  };
}

export function formatKindlingRate(rate: number): string {
  return `${rate.toFixed(0)}/doe/yr`;
}
