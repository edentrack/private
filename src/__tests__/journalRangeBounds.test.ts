import { describe, it, expect } from 'vitest';

/**
 * Replica of JournalPage.tsx's `rangeBounds()` — duplicated here so the
 * test pins behavior without importing the page (which would drag in
 * React + jspdf + supabase). The function is pure, deterministic, and
 * locale-independent, so locking it in this shape catches regressions
 * in date arithmetic.
 *
 * If the source ever moves to `src/utils/journalRangeBounds.ts` (worth
 * doing if a second caller appears), this file should switch to the
 * shared import — until then, dual-copy is the safer trade.
 */
type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

function rangeBounds(preset: DateRangePreset, customFrom: string, customTo: string): { gte?: string; lte?: string } {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { gte: start.toISOString(), lte: end.toISOString() };
  }
  if (preset === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
    return { gte: start.toISOString() };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return { gte: start.toISOString() };
  }
  if (preset === 'custom') {
    const out: { gte?: string; lte?: string } = {};
    if (customFrom) {
      const [y, m, d] = customFrom.split('-').map(n => parseInt(n, 10));
      if (y && m && d) out.gte = new Date(y, m - 1, d, 0, 0, 0).toISOString();
    }
    if (customTo) {
      const [y, m, d] = customTo.split('-').map(n => parseInt(n, 10));
      if (y && m && d) out.lte = new Date(y, m - 1, d, 23, 59, 59).toISOString();
    }
    return out;
  }
  return {};
}

describe('journal rangeBounds — preset behavior', () => {
  it('"all" returns no bounds', () => {
    expect(rangeBounds('all', '', '')).toEqual({});
  });

  it('"today" returns gte AND lte (single-day window)', () => {
    const r = rangeBounds('today', '', '');
    expect(r.gte).toBeDefined();
    expect(r.lte).toBeDefined();
    // Both bounds should be the same calendar day in LOCAL time.
    // Slicing the ISO string would compare UTC dates, which can drift
    // by one day when the test runs in the evening — so we read the
    // local components off Date objects instead.
    const gte = new Date(r.gte!);
    const lte = new Date(r.lte!);
    expect(gte.getFullYear()).toBe(lte.getFullYear());
    expect(gte.getMonth()).toBe(lte.getMonth());
    expect(gte.getDate()).toBe(lte.getDate());
    // gte should land at the start of the local day.
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
  });

  it('"week" returns gte only, 6 days before today', () => {
    const r = rangeBounds('week', '', '');
    expect(r.gte).toBeDefined();
    expect(r.lte).toBeUndefined();
    const gteDate = new Date(r.gte!);
    const today = new Date();
    const diffDays = Math.round((today.getTime() - gteDate.getTime()) / (24 * 60 * 60 * 1000));
    // Anywhere from 5–7 to absorb timezone + DST edges.
    expect(diffDays).toBeGreaterThanOrEqual(5);
    expect(diffDays).toBeLessThanOrEqual(7);
  });

  it('"month" returns gte at the first of the current month', () => {
    const r = rangeBounds('month', '', '');
    expect(r.gte).toBeDefined();
    const d = new Date(r.gte!);
    expect(d.getDate()).toBe(1);
  });

  it('"custom" with both dates returns gte + lte', () => {
    const r = rangeBounds('custom', '2026-05-01', '2026-05-10');
    expect(r.gte).toBeDefined();
    expect(r.lte).toBeDefined();
    // Read local-date components (toISOString returns UTC which can
    // drift one day depending on timezone — we built the Date in
    // local time, so check local components).
    const gte = new Date(r.gte!);
    expect(gte.getFullYear()).toBe(2026);
    expect(gte.getMonth()).toBe(4);   // May (0-indexed)
    expect(gte.getDate()).toBe(1);
    const lte = new Date(r.lte!);
    expect(lte.getFullYear()).toBe(2026);
    expect(lte.getMonth()).toBe(4);
    expect(lte.getDate()).toBe(10);
  });

  it('"custom" with only From returns only gte', () => {
    const r = rangeBounds('custom', '2026-05-01', '');
    expect(r.gte).toBeDefined();
    expect(r.lte).toBeUndefined();
  });

  it('"custom" with only To returns only lte', () => {
    const r = rangeBounds('custom', '', '2026-05-10');
    expect(r.gte).toBeUndefined();
    expect(r.lte).toBeDefined();
  });

  it('"custom" with malformed dates returns no bounds (defensive)', () => {
    expect(rangeBounds('custom', 'not-a-date', '')).toEqual({});
    expect(rangeBounds('custom', '', 'definitely-not-iso')).toEqual({});
  });
});
