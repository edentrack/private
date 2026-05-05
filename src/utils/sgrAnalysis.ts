/**
 * Specific Growth Rate (SGR) — Phase B Step 9.
 *
 * SGR is the fish industry's standard daily growth metric. Unlike poultry's
 * Average Daily Gain (ADG, in grams/day), fish biologists track growth as
 * a *percentage* of body weight gained per day, because fish grow
 * exponentially (compounding) rather than linearly.
 *
 * Formula: SGR (%/day) = (ln(W2) - ln(W1)) / days * 100
 *   where W2 = current weight, W1 = previous weight, days = elapsed days
 *
 * Healthy ranges (percent body weight per day):
 *   - Tilapia (juvenile/grow-out): 1.5–3.0
 *   - Catfish: 1.2–2.5
 *   - Clarias: 1.5–3.0 (similar to tilapia)
 *   - Other warm-water species: 1.0–2.5
 *
 * <1% SGR is concerning — likely undernourished, water-quality issues,
 * or disease. >3% is exceptional growth (good) but verify the sample
 * is representative.
 */

export interface SgrInput {
  /** Earlier weight in grams (must be > 0). */
  previousWeightG: number;
  /** Later weight in grams (must be > 0 and > previousWeightG to be meaningful). */
  currentWeightG: number;
  /** Days elapsed between the two weight samples. */
  days: number;
}

export interface SgrResult {
  /** Specific growth rate in percent body weight per day, e.g. 2.3. */
  sgr: number;
  /** Health label based on the value: 'excellent' | 'healthy' | 'concerning' | 'critical' | 'invalid'. */
  status: 'excellent' | 'healthy' | 'concerning' | 'critical' | 'invalid';
  /** Tailwind colour token for the status pill. */
  color: 'green' | 'amber' | 'red' | 'gray';
  /** Plain-language label shown next to the number. */
  label: string;
}

/**
 * Calculate SGR from two weight samples.
 * Returns 'invalid' status if inputs are missing or non-positive.
 */
export function calculateSGR({ previousWeightG, currentWeightG, days }: SgrInput): SgrResult {
  if (
    !previousWeightG ||
    !currentWeightG ||
    previousWeightG <= 0 ||
    currentWeightG <= 0 ||
    !days ||
    days <= 0
  ) {
    return { sgr: 0, status: 'invalid', color: 'gray', label: 'No baseline' };
  }

  const sgr =
    ((Math.log(currentWeightG) - Math.log(previousWeightG)) / days) * 100;

  return classifySGR(sgr);
}

/**
 * Map a numeric SGR to a status, colour, and label.
 * Thresholds chosen for warm-water aquaculture (tilapia/catfish/clarias).
 * Cattle / cold-water species would use different cutoffs.
 */
export function classifySGR(sgr: number): SgrResult {
  if (sgr >= 3) {
    return { sgr, status: 'excellent', color: 'green', label: 'Excellent' };
  }
  if (sgr >= 1.5) {
    return { sgr, status: 'healthy', color: 'green', label: 'Healthy' };
  }
  if (sgr >= 1) {
    return { sgr, status: 'concerning', color: 'amber', label: 'Concerning' };
  }
  if (sgr > 0) {
    return { sgr, status: 'critical', color: 'red', label: 'Critical — investigate' };
  }
  // Negative SGR = fish lost weight (impossible in healthy farm — disease/stress).
  return { sgr, status: 'critical', color: 'red', label: 'Negative growth' };
}

/**
 * Format SGR for display ("2.3%/day").
 */
export function formatSGR(sgr: number, includeUnit = true): string {
  const rounded = sgr.toFixed(1);
  return includeUnit ? `${rounded}%/day` : rounded;
}
