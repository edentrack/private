import { describe, it, expect } from 'vitest';
import {
  LAYER_GROWTH_TARGETS,
  BROILER_GROWTH_TARGETS,
  getTargetWeight,
} from '../utils/growthTargets';

/**
 * Locks in the extended layer growth curve. Before this change the
 * curve stopped at week 72 and the chart went flat — farmers couldn't
 * tell whether their hens at week 80 (late lay) or week 100 (spent
 * layer) were at the right weight. We now run the full commercial
 * lifecycle so the chart's expected line keeps drawing through cull.
 *
 * The numbers come from Hy-Line / Lohmann standards (≈2.0kg body
 * weight at maturity, holding through lay with mild variance). If a
 * future tuning pass changes them, the test boundaries below should
 * be updated to match — but the SHAPE checks (monotone-ish curve,
 * positive deltas in growth, plateau through lay) must hold.
 */

describe('LAYER_GROWTH_TARGETS extended lifecycle', () => {
  it('covers every key milestone week from 0 through 100', () => {
    // Critical milestones we never want to drop. If one disappears,
    // chart lines through that point become interpolated guesses
    // instead of grounded standards.
    const requiredWeeks = [1, 8, 16, 18, 22, 25, 28, 30, 40, 56, 72, 80, 96, 100];
    for (const week of requiredWeeks) {
      expect(LAYER_GROWTH_TARGETS[week]).toBeDefined();
    }
  });

  it('shows growth phase weights climbing through week 28 (peak)', () => {
    const w8  = LAYER_GROWTH_TARGETS[8].weight;
    const w16 = LAYER_GROWTH_TARGETS[16].weight;
    const w20 = LAYER_GROWTH_TARGETS[20].weight;
    const w28 = LAYER_GROWTH_TARGETS[28].weight;
    expect(w8).toBeLessThan(w16);
    expect(w16).toBeLessThan(w20);
    expect(w20).toBeLessThan(w28);
    // Peak production weight should sit in the 1.85-1.95 kg band.
    expect(w28).toBeGreaterThanOrEqual(1.85);
    expect(w28).toBeLessThanOrEqual(1.95);
  });

  it('holds weight near 2.0kg through the maintenance phase', () => {
    const maintenanceWeeks = [30, 40, 56, 72];
    for (const w of maintenanceWeeks) {
      const weight = LAYER_GROWTH_TARGETS[w].weight;
      expect(weight).toBeGreaterThanOrEqual(1.88);
      expect(weight).toBeLessThanOrEqual(2.10);
    }
  });

  it('keeps the late-lay and spent-layer weights in the same flat band', () => {
    // Weight doesn't change much past week 72 — hens are cycling
    // nutrients into eggshell, not growing. We just want the chart
    // to keep drawing instead of going flat-line off-screen.
    const lateWeeks = [76, 80, 88, 96, 100];
    for (const w of lateWeeks) {
      const weight = LAYER_GROWTH_TARGETS[w].weight;
      expect(weight).toBeGreaterThanOrEqual(1.95);
      expect(weight).toBeLessThanOrEqual(2.10);
    }
  });

  it('marks late-lay and spent-layer weeks with descriptive text', () => {
    // The description string surfaces in the chart's hover tooltip
    // and on the dashboard's "expected" badge. Without it the
    // farmer sees "Maintenance" forever — these labels are what
    // tells them which production phase they're in.
    expect(LAYER_GROWTH_TARGETS[80].description).toMatch(/late lay/i);
    expect(LAYER_GROWTH_TARGETS[92].description).toMatch(/spent|cull/i);
    expect(LAYER_GROWTH_TARGETS[100].description).toMatch(/spent|cycle|cull|sell/i);
  });
});

describe('getTargetWeight interpolation in extended layer band', () => {
  it('returns the exact match when the week is in the table', () => {
    const w = getTargetWeight('layer', 28);
    expect(w.weight).toBe(LAYER_GROWTH_TARGETS[28].weight);
  });

  it('interpolates between the nearest two weeks for a gap', () => {
    // Week 75 sits between 72 (2.02kg) and 76 (2.02kg). Interpolated
    // value should be inside that band.
    const w = getTargetWeight('layer', 75);
    expect(w.weight).toBeGreaterThanOrEqual(2.0);
    expect(w.weight).toBeLessThanOrEqual(2.1);
  });

  it('extrapolates past the end of the table with the last known value', () => {
    // Week 110 — past the end. Should fall back to week 100's value
    // rather than going to zero or undefined.
    const w = getTargetWeight('layer', 110);
    expect(w.weight).toBeGreaterThanOrEqual(2.0);
    expect(w.weight).toBeLessThanOrEqual(2.1);
  });

  it('does not lose data for any week between 0 and 100', () => {
    // Smoke test: every integer week from 1 through 100 returns a
    // usable target. Catches regressions where someone accidentally
    // deletes a row from the table.
    for (let wk = 1; wk <= 100; wk += 1) {
      const t = getTargetWeight('layer', wk);
      expect(t).toBeDefined();
      expect(t.weight).toBeGreaterThan(0);
    }
  });
});

describe('BROILER_GROWTH_TARGETS still ends at slaughter age', () => {
  it('peaks at week 8 (commercial slaughter window)', () => {
    expect(BROILER_GROWTH_TARGETS[8]).toBeDefined();
    expect(BROILER_GROWTH_TARGETS[8].weight).toBeGreaterThanOrEqual(2.5);
  });

  it('keeps a sensible value past week 8 if the farmer holds birds longer', () => {
    const w12 = getTargetWeight('broiler', 12);
    expect(w12.weight).toBeGreaterThanOrEqual(2.5);
    // Shouldn't go wildly higher — birds plateau at slaughter weight.
    expect(w12.weight).toBeLessThanOrEqual(5.0);
  });
});
