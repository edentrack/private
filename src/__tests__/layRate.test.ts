import { describe, it, expect } from 'vitest';
import { isLayingHen, getFlockAgeDays, POINT_OF_LAY_DAYS } from '../utils/flockAge';
import { computeLayRate, formatLayRateExplainer } from '../utils/layRate';

/**
 * Lay-rate regression coverage.
 *
 * The bug that prompted these tests existed in four files at once, all
 * silently making farmers' real production look 2-7× worse than reality.
 * Each scenario below maps to a specific way the helper used to break.
 */

// Test fixtures ----------------------------------------------------------
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = daysAgo(0);
const YESTERDAY = daysAgo(1);

describe('isLayingHen', () => {
  it('returns false for non-layer types regardless of age', () => {
    expect(isLayingHen({ type: 'Broiler', arrival_date: daysAgo(300) })).toBe(false);
    expect(isLayingHen({ type: 'Catfish', arrival_date: daysAgo(300) })).toBe(false);
    expect(isLayingHen({ type: 'Rabbitry', arrival_date: daysAgo(300) })).toBe(false);
  });

  it('returns false for Layer pullets younger than POINT_OF_LAY_DAYS', () => {
    // Pullet at 80 days — well below the 126-day threshold.
    expect(isLayingHen({ type: 'Layer', arrival_date: daysAgo(80) })).toBe(false);
    // Boundary: 125 days = still pullet.
    expect(isLayingHen({ type: 'Layer', arrival_date: daysAgo(125) })).toBe(false);
  });

  it('returns true for Layer flocks at or past POINT_OF_LAY_DAYS', () => {
    expect(isLayingHen({ type: 'Layer', arrival_date: daysAgo(POINT_OF_LAY_DAYS) })).toBe(true);
    expect(isLayingHen({ type: 'Layer', arrival_date: daysAgo(200) })).toBe(true);
  });

  it('honours age_at_arrival_days so point-of-lay pullets cross the threshold immediately', () => {
    // Bought at point-of-lay 18 weeks (= 126 days) and arrived TODAY:
    // sinceArrival = 0, age_at_arrival_days = 126 → total 126 → laying.
    expect(
      isLayingHen({ type: 'Layer', arrival_date: TODAY, age_at_arrival_days: 126 }),
    ).toBe(true);

    // Edge: arrived as 17-week pullet. Halfway through the test window
    // they cross POL because real-world 7 days have elapsed.
    const arrivedAtWeek17 = { type: 'Layer', arrival_date: daysAgo(7), age_at_arrival_days: 119 };
    // sinceArrival = 7, offset = 119 → total 126 → just barely laying.
    expect(isLayingHen(arrivedAtWeek17)).toBe(true);
    // Offset by 1 fewer day, still pre-POL.
    expect(isLayingHen({ ...arrivedAtWeek17, age_at_arrival_days: 118 })).toBe(false);
  });

  it('accepts purpose=layer for older flocks where type was not specified', () => {
    expect(isLayingHen({ purpose: 'layer', arrival_date: daysAgo(200) })).toBe(true);
    expect(isLayingHen({ purpose: 'layers', arrival_date: daysAgo(200) })).toBe(true);
    expect(isLayingHen({ purpose: 'broilers', arrival_date: daysAgo(200) })).toBe(false);
  });
});

describe('getFlockAgeDays + age_at_arrival_days', () => {
  it('combines days-since-arrival with the offset', () => {
    expect(getFlockAgeDays({ arrival_date: daysAgo(10), age_at_arrival_days: 50 })).toBe(60);
    // No offset present
    expect(getFlockAgeDays({ arrival_date: daysAgo(10) })).toBe(10);
    // Negative offset is clamped to 0
    expect(getFlockAgeDays({ arrival_date: daysAgo(10), age_at_arrival_days: -5 })).toBe(10);
  });
});

describe('computeLayRate — mixed flock state', () => {
  it('counts only active layer hens past POL in the denominator', () => {
    // Mixed scenario from the brief:
    //   200 pullets (80 days)  → excluded (not POL yet)
    //   300 layers (200 days)  → counted: 300
    //   100 broilers           → excluded (wrong type)
    //   50 archived layers     → excluded (status)
    const flocks = [
      { type: 'Layer', current_count: 200, arrival_date: daysAgo(80), status: 'active' },
      { type: 'Layer', current_count: 300, arrival_date: daysAgo(200), status: 'active' },
      { type: 'Broiler', current_count: 100, arrival_date: daysAgo(45), status: 'active' },
      { type: 'Layer', current_count: 50, arrival_date: daysAgo(400), status: 'archived' },
    ];
    // 5 days, 200 eggs/day on the 300 hens = 67% target.
    const collections = [
      { collected_on: daysAgo(0), total_eggs: 200 },
      { collected_on: daysAgo(1), total_eggs: 200 },
      { collected_on: daysAgo(2), total_eggs: 200 },
      { collected_on: daysAgo(3), total_eggs: 200 },
      { collected_on: daysAgo(4), total_eggs: 200 },
    ];
    const r = computeLayRate(flocks, collections);
    expect(r.layingHenCount).toBe(300);
    expect(r.daysWithData).toBe(5);
    expect(r.totalEggs).toBe(1000);
    // 1000 / (300 × 5) × 100 = 66.67%
    expect(r.ratePct).toBeCloseTo(66.67, 1);
  });
});

describe('computeLayRate — sparse-day window', () => {
  it('divides by the number of days WITH data, not the calendar window', () => {
    // 5 days of data inside a 7-day calendar window. Pre-fix this read as
    // 5/7 of the real rate (i.e. 47% instead of 65%).
    const flocks = [
      { type: 'Layer', current_count: 300, arrival_date: daysAgo(200), status: 'active' },
    ];
    const collections = [
      { collected_on: daysAgo(0), total_eggs: 195 },
      { collected_on: daysAgo(1), total_eggs: 198 },
      { collected_on: daysAgo(2), total_eggs: 200 },
      { collected_on: daysAgo(3), total_eggs: 192 },
      { collected_on: daysAgo(4), total_eggs: 197 },
      // No entries for days 5 + 6.
    ];
    const r = computeLayRate(flocks, collections);
    expect(r.daysWithData).toBe(5);
    expect(r.totalEggs).toBe(982);
    // 982 / (300 × 5) × 100 ≈ 65.5%
    expect(r.ratePct).toBeCloseTo(65.47, 1);
  });

  it('collapses morning + evening collections on the same date to one day', () => {
    const flocks = [
      { type: 'Layer', current_count: 100, arrival_date: daysAgo(200), status: 'active' },
    ];
    const collections = [
      { collected_on: TODAY, total_eggs: 30 }, // morning
      { collected_on: TODAY, total_eggs: 30 }, // evening
    ];
    const r = computeLayRate(flocks, collections);
    expect(r.daysWithData).toBe(1);
    expect(r.totalEggs).toBe(60);
    // 60 / (100 × 1) × 100 = 60%
    expect(r.ratePct).toBeCloseTo(60, 1);
  });
});

describe('computeLayRate — zero-collection days', () => {
  it('returns 0% when no collections were logged', () => {
    const flocks = [
      { type: 'Layer', current_count: 300, arrival_date: daysAgo(200), status: 'active' },
    ];
    const r = computeLayRate(flocks, []);
    expect(r.layingHenCount).toBe(300);
    expect(r.daysWithData).toBe(0);
    expect(r.totalEggs).toBe(0);
    expect(r.ratePct).toBe(0);
  });

  it('handles a single-day-with-zero-eggs row honestly', () => {
    const flocks = [
      { type: 'Layer', current_count: 300, arrival_date: daysAgo(200), status: 'active' },
    ];
    const collections = [{ collected_on: TODAY, total_eggs: 0 }];
    const r = computeLayRate(flocks, collections);
    expect(r.daysWithData).toBe(1);
    expect(r.totalEggs).toBe(0);
    expect(r.ratePct).toBe(0);
  });
});

describe('computeLayRate — single vs multi-flock aggregation match', () => {
  it('multi-flock total matches the sum of single-flock denominators', () => {
    const flockA = { type: 'Layer', current_count: 200, arrival_date: daysAgo(200), status: 'active' };
    const flockB = { type: 'Layer', current_count: 300, arrival_date: daysAgo(200), status: 'active' };
    const collections = [
      { collected_on: TODAY, total_eggs: 320 }, // 200×0.6 + 300×0.4 = 120 + 120 = 240... actually 320 just for shape
    ];
    const a = computeLayRate([flockA], collections);
    const b = computeLayRate([flockB], collections);
    const ab = computeLayRate([flockA, flockB], collections);
    // Single-flock denominators sum to multi-flock denominator
    expect(ab.layingHenCount).toBe(a.layingHenCount + b.layingHenCount);
    // The same total eggs were attributed in both runs (collections ARE shared in this test setup)
    expect(ab.totalEggs).toBe(a.totalEggs);
    // Multi-flock rate = totalEggs / (totalHens × days)
    expect(ab.ratePct).toBeCloseTo((320 / (500 * 1)) * 100, 1);
  });
});

describe('computeLayRate — boundary: flock crosses POL mid-window', () => {
  it('counts the flock as laying for the whole window if it is past POL today', () => {
    // Arrived 130 days ago = 4 days post-POL today. The window started 7
    // days ago, so the flock was a pullet (~123 days) at window start but
    // is now eligible. We accept the live denominator as the truth.
    const flocks = [
      { type: 'Layer', current_count: 100, arrival_date: daysAgo(130), status: 'active' },
    ];
    const collections = [{ collected_on: TODAY, total_eggs: 40 }];
    const r = computeLayRate(flocks, collections);
    expect(r.layingHenCount).toBe(100);
    expect(r.ratePct).toBeCloseTo(40, 1);
  });

  it('excludes a flock that is still pre-POL even at the end of the window', () => {
    const flocks = [
      // Arrived 100 days ago, age 100 days < 126 → still pullet.
      { type: 'Layer', current_count: 100, arrival_date: daysAgo(100), status: 'active' },
    ];
    const collections = [{ collected_on: TODAY, total_eggs: 5 }];
    const r = computeLayRate(flocks, collections);
    expect(r.layingHenCount).toBe(0);
    expect(r.ratePct).toBe(0); // No denominator → rate is 0, not infinity.
  });
});

describe('computeLayRate — trays + broken eggs fallback', () => {
  it('falls back to trays × eggsPerTray − broken when total_eggs is null', () => {
    const flocks = [
      { type: 'Layer', current_count: 100, arrival_date: daysAgo(200), status: 'active' },
    ];
    const collections = [
      // 4 trays at 30 eggs/tray = 120, minus 5 broken = 115 good eggs.
      { collected_on: TODAY, trays: 4, broken: 5, total_eggs: null },
    ];
    const r = computeLayRate(flocks, collections, 30);
    expect(r.totalEggs).toBe(115);
    expect(r.ratePct).toBeCloseTo(115, 1); // 115 / (100×1) × 100 = 115%
  });
});

describe('formatLayRateExplainer', () => {
  it('produces the tooltip copy with hen count and day count', () => {
    const r = { ratePct: 65, layingHenCount: 300, daysWithData: 5, totalEggs: 975 };
    expect(formatLayRateExplainer(r)).toBe(
      'Across 300 hens past point-of-lay, over 5 collection days.',
    );
  });

  it('uses singular "day" when daysWithData is 1', () => {
    const r = { ratePct: 60, layingHenCount: 100, daysWithData: 1, totalEggs: 60 };
    expect(formatLayRateExplainer(r)).toContain('1 collection day.');
  });

  it('explains the zero-hens case clearly', () => {
    const r = { ratePct: 0, layingHenCount: 0, daysWithData: 0, totalEggs: 0 };
    expect(formatLayRateExplainer(r)).toContain('No layer hens');
  });

  it('explains the no-data-yet case for a flock at POL', () => {
    const r = { ratePct: 0, layingHenCount: 200, daysWithData: 0, totalEggs: 0 };
    expect(formatLayRateExplainer(r)).toContain('200 hens past point-of-lay');
    expect(formatLayRateExplainer(r)).toContain('no collections logged yet');
  });
});
