/**
 * Age helpers for flocks/ponds.
 *
 * The `flocks.age_at_arrival_days` column lets a farmer say "they were
 * already X days old when I got them" — typical for layer farms buying
 * point-of-lay pullets, fish farms buying fingerlings, or anyone starting
 * to track an existing flock retroactively.
 *
 * Every age/week calculation in the app should go through these helpers
 * so the offset is applied consistently. Components must NOT compute
 * `(today - arrival_date) / 7` directly.
 */

interface FlockLike {
  arrival_date?: string;
  created_at?: string;
  age_at_arrival_days?: number | null;
}

/** Parse a YYYY-MM-DD or ISO date as a local date (avoids the UTC off-by-one bug). */
function parseLocalDate(s: string): Date {
  const p = String(s).split(/[-T]/);
  return p.length >= 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(s);
}

/**
 * Days since the animals were "born/hatched/stocked at week 0", inclusive
 * of any age they had at arrival. Returns 0 if no arrival date.
 *
 * Uses Math.round on the millisecond diff so DST transitions (a 23-hour or
 * 25-hour day in countries with daylight saving) don't off-by-one the
 * count. Without round() a flock with arrival_date = 126 days ago could
 * read as 125 days old when crossing a spring-forward boundary.
 */
export function getFlockAgeDays(flock: FlockLike | null | undefined): number {
  if (!flock) return 0;
  const baseDateStr = flock.arrival_date || flock.created_at;
  if (!baseDateStr) return 0;
  const arrival = parseLocalDate(baseDateStr);
  arrival.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const sinceArrival = Math.max(0, Math.round((now.getTime() - arrival.getTime()) / 86_400_000));
  const offset = Math.max(0, flock.age_at_arrival_days ?? 0);
  return sinceArrival + offset;
}

/**
 * Current week of life (1-indexed). Always at least 1.
 *   week 1 = days 0–6, week 2 = days 7–13, etc.
 */
export function getFlockWeek(flock: FlockLike | null | undefined): number {
  return Math.max(1, Math.floor(getFlockAgeDays(flock) / 7) + 1);
}

/**
 * Returns { weeks, days } where `days` is the leftover days within the current week.
 * Useful for the dashboard "Week 13 · 4d" pill.
 */
export function getFlockAge(flock: FlockLike | null | undefined): { weeks: number; days: number } {
  const total = getFlockAgeDays(flock);
  const weeks = Math.max(1, Math.floor(total / 7) + 1);
  const days = total % 7;
  return { weeks, days };
}

/**
 * Point of lay: layer hens typically start producing around week 18 (126 days).
 * Used to exclude pullets/growers from the lay-rate denominator on the
 * dashboard and weekly report.
 */
export const POINT_OF_LAY_DAYS = 126;

/**
 * Returns true if the flock is a Layer that's old enough to actually be laying.
 * Includes the `age_at_arrival_days` offset so point-of-lay pullets bought at
 * 18+ weeks are counted from day 0.
 */
export function isLayingHen(
  flock: (FlockLike & { type?: string | null; purpose?: string | null }) | null | undefined,
): boolean {
  if (!flock) return false;
  const t = String(flock.type || '').toLowerCase();
  const p = String(flock.purpose || '').toLowerCase();
  const isLayerKind = t === 'layer' || p === 'layer' || p === 'layers';
  if (!isLayerKind) return false;
  return getFlockAgeDays(flock) >= POINT_OF_LAY_DAYS;
}
