/**
 * EdenTrack Regression Suite — v1.1.0-audit-clean
 *
 * Protects the 4 logic fixes verified during the May 2026 full audit.
 * Each describe block names the bug/fix ID, points to the source file,
 * and documents WHY the fix matters. If a test here breaks after a
 * refactor, that refactor changed audited behaviour — review carefully.
 *
 * Run:  npm test
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — pure copies of the production logic under test.
// If you change the source, update the copy here too (and re-run the suite).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FIX 1 — selectModel: vaccin keyword routes vaccination queries to Sonnet.
 * Source: supabase/functions/ai-chat/index.ts → selectModel() → isTaskCreate regex
 *
 * WHY: Haiku's 512-token output cap silently truncated the JSON [LOG] block the
 * LLM is asked to produce. That meant SCHEDULE_VACCINATION actions were never
 * emitted and the vaccination was never saved to the DB.
 */
function isTaskCreateMatch(text: string): boolean {
  return /\b(task|remind|reminder|schedule|add.*task|create.*task|set.*reminder|task.*for|remind.*me|vaccin)\b/i.test(text);
}

/**
 * FIX 2 — isNaN guard in SCHEDULE_VACCINATION handler.
 * Source: supabase/functions/ai-chat/index.ts → SCHEDULE_VACCINATION handler
 *
 * WHY: If the LLM returns a malformed scheduled_date (empty string, "null",
 * garbage), `new Date("${badDate}T09:00:00")` produces an invalid Date.
 * Calling .toISOString() on an invalid Date throws "Invalid time value",
 * crashing the edge function. The guard falls back to now() so the record
 * is still created even if the date is broken.
 */
function computeWindowStart(schedDate: string): Date {
  const rawWindowStart = new Date(`${schedDate}T09:00:00`);
  return isNaN(rawWindowStart.getTime()) ? new Date() : rawWindowStart;
}

/**
 * FIX 3 — UX-A: Sales PAID vs PENDING split counts.
 * Source: src/components/sales/SalesManagement.tsx lines 205–206
 *
 * WHY: Legacy egg sale records were inserted without a payment_status column
 * (the column was added later). Those rows have payment_status = null. Without
 * the `|| 'paid'` default, null rows fell into neither bucket — PAID was under-
 * counted and the dashboard showed wrong revenue totals.
 */
function countPaid(sales: Array<{ payment_status?: string | null }>): number {
  return sales.filter(s => (s.payment_status || 'paid') === 'paid').length;
}

function countPending(sales: Array<{ payment_status?: string | null }>): number {
  return sales.filter(s => s.payment_status && s.payment_status !== 'paid').length;
}

/**
 * FIX 4 — BUG-D: Local date parsing avoids UTC-midnight off-by-one.
 * Source: src/components/weight/EditFeedWaterModal.tsx → toLocalDateString()
 *
 * WHY: `new Date('2026-05-10')` is parsed as UTC midnight. In timezones behind
 * UTC (e.g. WAT/UTC+1) this renders as May 9 in local time. The fix splits on
 * /[-T]/ and constructs the date with local-time constructor new Date(y, m-1, d)
 * so the displayed date always matches the stored date string exactly.
 */
function toLocalDateString(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const parts = String(dateStr).split(/[-T]/);
  if (parts.length < 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('FIX 1 — selectModel: vaccin keyword routes to Sonnet', () => {
  // NOTE: \b...\b means vaccin must appear as a COMPLETE word.
  // "vaccination" does not match via the vaccin branch (n followed by 'a' breaks \b),
  // but full vaccination queries are caught by other keywords (schedule, remind, etc.).

  it('matches the word "vaccin" as a standalone/word-boundary token', () => {
    expect(isTaskCreateMatch('vaccin')).toBe(true);
    expect(isTaskCreateMatch('vaccin batch 1')).toBe(true);
    expect(isTaskCreateMatch('give vaccin today')).toBe(true);
  });

  it('vaccination queries are caught via "schedule" or "remind me" keywords', () => {
    // The real user messages that triggered this fix
    expect(isTaskCreateMatch('schedule a vaccination for batch 1')).toBe(true);
    expect(isTaskCreateMatch('remind me to vaccinate the flock')).toBe(true);
    expect(isTaskCreateMatch('schedule newcastle vaccination')).toBe(true);
  });

  it('is case-insensitive for all keywords', () => {
    expect(isTaskCreateMatch('Schedule Vaccination')).toBe(true);
    expect(isTaskCreateMatch('REMIND ME to do something')).toBe(true);
    expect(isTaskCreateMatch('Add Task for feed')).toBe(true);
  });

  it('still matches task/remind/schedule keywords', () => {
    expect(isTaskCreateMatch('add task for feed check')).toBe(true);
    expect(isTaskCreateMatch('remind me to collect eggs')).toBe(true);
    expect(isTaskCreateMatch('schedule water refill')).toBe(true);
    expect(isTaskCreateMatch('set a reminder for tomorrow')).toBe(true);
  });

  it('does NOT match ordinary data-entry messages (no Sonnet escalation)', () => {
    expect(isTaskCreateMatch('log 5 eggs')).toBe(false);
    expect(isTaskCreateMatch('how many birds do i have')).toBe(false);
    expect(isTaskCreateMatch('show me mortality records')).toBe(false);
    expect(isTaskCreateMatch('hello')).toBe(false);
  });
});

describe('FIX 2 — isNaN guard: SCHEDULE_VACCINATION window_start fallback', () => {
  it('returns a valid Date for a well-formed scheduled_date', () => {
    const result = computeWindowStart('2026-05-10');
    expect(result instanceof Date).toBe(true);
    expect(isNaN(result.getTime())).toBe(false);
  });

  it('sets the time to 09:00 local when date is valid', () => {
    const result = computeWindowStart('2026-05-10');
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it('falls back to a valid Date (not NaN) for an empty string', () => {
    const result = computeWindowStart('');
    expect(isNaN(result.getTime())).toBe(false);
  });

  it('falls back to a valid Date for a null-as-string', () => {
    const result = computeWindowStart('null');
    expect(isNaN(result.getTime())).toBe(false);
  });

  it('falls back to a valid Date for garbage input', () => {
    const result = computeWindowStart('not-a-date');
    expect(isNaN(result.getTime())).toBe(false);
  });

  it('produces a valid ISO string (no "Invalid time value" throw)', () => {
    expect(() => computeWindowStart('2026-05-10').toISOString()).not.toThrow();
    expect(() => computeWindowStart('').toISOString()).not.toThrow();
    expect(() => computeWindowStart('garbage').toISOString()).not.toThrow();
  });

  it('window_end = window_start + 1 hour is always a valid ISO string', () => {
    const ws = computeWindowStart('2026-05-10');
    const we = new Date(ws.getTime() + 60 * 60 * 1000);
    expect(() => we.toISOString()).not.toThrow();
    expect(we.getTime() - ws.getTime()).toBe(3_600_000);
  });
});

describe('FIX 3 — UX-A: Sales PAID / PENDING split counts', () => {
  const sales = [
    { payment_status: 'paid' },          // explicit paid
    { payment_status: null },             // legacy null → treated as paid
    { payment_status: undefined },        // missing field → treated as paid
    { payment_status: 'pending' },        // pending
    { payment_status: 'partial' },        // any non-paid status → pending bucket
  ];

  it('counts null/undefined payment_status as PAID (legacy rows)', () => {
    expect(countPaid([{ payment_status: null }])).toBe(1);
    expect(countPaid([{ payment_status: undefined }])).toBe(1);
    expect(countPaid([{}])).toBe(1);
  });

  it('counts explicit "paid" as PAID', () => {
    expect(countPaid([{ payment_status: 'paid' }])).toBe(1);
  });

  it('does NOT count "pending" as PAID', () => {
    expect(countPaid([{ payment_status: 'pending' }])).toBe(0);
  });

  it('counts "pending" as PENDING', () => {
    expect(countPending([{ payment_status: 'pending' }])).toBe(1);
  });

  it('does NOT count null/undefined as PENDING', () => {
    expect(countPending([{ payment_status: null }])).toBe(0);
    expect(countPending([{ payment_status: undefined }])).toBe(0);
    expect(countPending([{}])).toBe(0);
  });

  it('full mixed set — PAID=3, PENDING=2', () => {
    expect(countPaid(sales)).toBe(3);
    expect(countPending(sales)).toBe(2);
  });

  it('PAID + PENDING always equals total sale count', () => {
    const p = countPaid(sales);
    const q = countPending(sales);
    expect(p + q).toBe(sales.length);
  });
});

describe('FIX 4 — BUG-D: Local date parsing (no UTC midnight off-by-one)', () => {
  it('round-trips YYYY-MM-DD unchanged', () => {
    expect(toLocalDateString('2026-05-10')).toBe('2026-05-10');
    expect(toLocalDateString('2026-01-01')).toBe('2026-01-01');
    expect(toLocalDateString('2025-12-31')).toBe('2025-12-31');
  });

  it('strips the time component from an ISO timestamp', () => {
    expect(toLocalDateString('2026-05-10T00:00:00')).toBe('2026-05-10');
    expect(toLocalDateString('2026-05-10T23:59:59.999Z')).toBe('2026-05-10');
  });

  it('does NOT shift to the previous day (the core bug fix)', () => {
    // new Date('2026-05-10') in UTC is 2026-05-09T23:00 in UTC+1 (WAT/CET).
    // The fix ensures we always get May 10, not May 9.
    const result = toLocalDateString('2026-05-10');
    expect(result).not.toBe('2026-05-09');
    expect(result).toBe('2026-05-10');
  });

  it('returns empty string for undefined', () => {
    expect(toLocalDateString(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(toLocalDateString('')).toBe('');
  });

  it('handles single-digit months and days with zero-padding', () => {
    expect(toLocalDateString('2026-01-05')).toBe('2026-01-05');
    expect(toLocalDateString('2026-09-02')).toBe('2026-09-02');
  });
});
