/**
 * Pure helpers for computing the lay-rate KPI.
 *
 * Why this lives in its own module:
 *   The same calculation runs in CoreKPISection (dashboard), reportGenerator
 *   (weekly WhatsApp report), Eden's edge function, and the Insights page.
 *   When the bug existed in 4 places at once it was nearly invisible —
 *   centralising the math makes regressions impossible to hide.
 *
 * Used together with `isLayingHen` and `getFlockAgeDays` from `flockAge.ts`.
 */

import { isLayingHen } from './flockAge';

interface FlockForLayRate {
  type?: string | null;
  purpose?: string | null;
  current_count?: number | null;
  arrival_date?: string;
  created_at?: string;
  age_at_arrival_days?: number | null;
  status?: string | null;
}

interface CollectionForLayRate {
  /** YYYY-MM-DD or ISO. May be null for synthetic rows. */
  collected_on?: string | null;
  collection_date?: string | null;
  total_eggs?: number | null;
  trays?: number | null;
  broken?: number | null;
}

export interface LayRateResult {
  /** Percentage. 0 when the denominator is undefined. */
  ratePct: number;
  /** Number of laying-age hens that went into the denominator. */
  layingHenCount: number;
  /** Number of distinct dates with at least one collection row. */
  daysWithData: number;
  /** Sum of eggs across all included collections. */
  totalEggs: number;
}

const ACTIVE_STATUSES = new Set(['active', 'live', null, undefined, '']);

function isActive(flock: FlockForLayRate): boolean {
  return ACTIVE_STATUSES.has(flock.status as any);
}

function eggsFor(c: CollectionForLayRate, eggsPerTray: number): number {
  const total = Number(c.total_eggs ?? 0);
  if (total > 0) return total;
  const trays = Number(c.trays || 0);
  const broken = Number(c.broken || 0);
  return Math.max(0, trays * eggsPerTray - broken);
}

function dateKey(c: CollectionForLayRate): string | null {
  const raw = c.collected_on ?? c.collection_date;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

/**
 * Compute lay rate over a set of flocks and the collections that fall in
 * the window of interest.
 *
 * Denominator: ONLY active flocks that pass `isLayingHen` (Layer type AND
 * age >= 126 days, honouring `age_at_arrival_days`).
 *
 * Days divisor: number of distinct collection dates (NOT calendar days),
 * so a sparse log of 5 of 7 days reports the right rate instead of 5/7
 * of the real rate.
 */
export function computeLayRate(
  flocks: FlockForLayRate[],
  collections: CollectionForLayRate[],
  eggsPerTray = 30,
): LayRateResult {
  const layingHenCount = (flocks || [])
    .filter((f) => f && isActive(f) && isLayingHen(f))
    .reduce((sum, f) => sum + Math.max(0, Number(f.current_count) || 0), 0);

  const distinctDays = new Set<string>();
  let totalEggs = 0;
  for (const c of collections || []) {
    totalEggs += eggsFor(c, eggsPerTray);
    const key = dateKey(c);
    if (key) distinctDays.add(key);
  }

  const daysWithData = distinctDays.size;
  const ratePct =
    layingHenCount > 0 && daysWithData > 0
      ? (totalEggs / (layingHenCount * daysWithData)) * 100
      : 0;

  return { ratePct, layingHenCount, daysWithData, totalEggs };
}

/**
 * Format the explanation tooltip for the dashboard KPI:
 *   "Across 300 hens past point-of-lay, over 5 collection days."
 */
export function formatLayRateExplainer(r: LayRateResult): string {
  if (r.layingHenCount === 0) {
    return 'No layer hens past point-of-lay (week 18) yet — the rate stays 0% until they start producing.';
  }
  if (r.daysWithData === 0) {
    return `Across ${r.layingHenCount.toLocaleString()} hens past point-of-lay, no collections logged yet in this window.`;
  }
  const dayWord = r.daysWithData === 1 ? 'day' : 'days';
  return `Across ${r.layingHenCount.toLocaleString()} hens past point-of-lay, over ${r.daysWithData} collection ${dayWord}.`;
}
