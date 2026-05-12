import { describe, it, expect } from 'vitest';
import { computeDressingPct } from '../components/rabbits/RabbitSalesPage';
import { kitSurvivalRate } from '../components/rabbits/LittersPage';

describe('computeDressingPct', () => {
  it('returns correct dressing percentage', () => {
    expect(computeDressingPct(25, 13.5)).toBe(54);
  });

  it('rounds to 2 decimal places', () => {
    expect(computeDressingPct(3, 1.6)).toBe(53.33);
  });

  it('returns null when live weight is 0', () => {
    expect(computeDressingPct(0, 1.5)).toBeNull();
  });

  it('handles typical rabbit dressing range 50-55%', () => {
    const pct = computeDressingPct(2.5, 1.3);
    expect(pct).toBeGreaterThanOrEqual(50);
    expect(pct).toBeLessThanOrEqual(56);
  });
});

describe('kitSurvivalRate', () => {
  it('returns correct survival percentage', () => {
    expect(kitSurvivalRate(8, 7)).toBe(88);
  });

  it('returns 100% when all kits weaned', () => {
    expect(kitSurvivalRate(6, 6)).toBe(100);
  });

  it('returns null when weaned is null (not yet weaned)', () => {
    expect(kitSurvivalRate(8, null)).toBeNull();
  });

  it('returns null when born alive is 0 (stillborn litter)', () => {
    expect(kitSurvivalRate(0, null)).toBeNull();
  });

  it('handles partial survival correctly', () => {
    expect(kitSurvivalRate(10, 5)).toBe(50);
  });
});
