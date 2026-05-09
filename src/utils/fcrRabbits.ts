/**
 * Rabbit Feed Conversion Ratio (FCR) — Phase C.
 *
 * FCR for meat rabbits = kg feed / kg liveweight gained.
 *
 * Healthy ranges:
 *   - 2.8-3.2: excellent (commercial meat rabbit standard)
 *   - 3.2-3.8: acceptable (typical smallholder)
 *   - 3.8-4.5: high (review feed quality, breed, environment)
 *   - >4.5: investigate seriously (nutrition, disease, mortality eating
 *     into surviving stock's per-kg cost)
 *
 * Comparison points:
 *   - Broilers: 1.6-2.0
 *   - Tilapia: 1.4-1.8
 *   - Catfish: 1.5-2.0
 *   - Meat rabbits: 3.0+ (mammals are inherently less feed-efficient than
 *     fish or chicken because they spend energy on body temperature)
 */

export interface RabbitFcrInput {
  /** kg of feed used in the period. */
  feedKg: number;
  /** kg of liveweight gained in the period. Use (current_count × current_avg_g) − initial weight. */
  liveweightGainedKg: number;
  /** Type of rabbit operation: meat (faster grow-out) or breeder (longer cycle). */
  rabbitType?: 'Meat Rabbits' | 'Breeder Rabbits';
}

export interface RabbitFcrResult {
  fcr: number | null;
  status: 'excellent' | 'acceptable' | 'high' | 'invalid';
  color: 'green' | 'amber' | 'red' | 'gray';
  label: string;
  reason?: string;
}

export function calculateRabbitFCR({
  feedKg,
  liveweightGainedKg,
  rabbitType = 'Meat Rabbits',
}: RabbitFcrInput): RabbitFcrResult {
  if (feedKg <= 0) {
    return { fcr: null, status: 'invalid', color: 'gray', label: ' - ', reason: 'No feed logged in period' };
  }
  if (liveweightGainedKg <= 0) {
    return {
      fcr: null,
      status: 'invalid',
      color: 'gray',
      label: ' - ',
      reason: 'No liveweight gain (need 2+ weight samples)',
    };
  }

  const fcr = feedKg / liveweightGainedKg;
  return classifyRabbitFCR(fcr, rabbitType);
}

export function classifyRabbitFCR(
  fcr: number,
  rabbitType: 'Meat Rabbits' | 'Breeder Rabbits' = 'Meat Rabbits',
): RabbitFcrResult {
  // Breeders run looser thresholds because the FCR includes feed for the
  // doe + buck not the kits.
  const excellentMax = rabbitType === 'Breeder Rabbits' ? 3.5 : 3.2;
  const acceptableMax = rabbitType === 'Breeder Rabbits' ? 4.5 : 3.8;

  if (fcr <= excellentMax) {
    return { fcr, status: 'excellent', color: 'green', label: 'Excellent' };
  }
  if (fcr <= acceptableMax) {
    return { fcr, status: 'acceptable', color: 'amber', label: 'Acceptable' };
  }
  return { fcr, status: 'high', color: 'red', label: 'High - review feeding plan' };
}

export function formatRabbitFCR(fcr: number | null): string {
  if (fcr === null) return ' - ';
  return fcr.toFixed(2);
}
