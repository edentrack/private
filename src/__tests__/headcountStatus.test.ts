import { describe, it, expect } from 'vitest';
import {
  headcountStatus,
  getMaxActiveAnimals,
  MAX_ACTIVE_ANIMALS_PER_TIER,
} from '../utils/planGating';

/**
 * Behavior contract for the headcount-based plan gate:
 *
 *   pct < 80    → ok           (no banner)
 *   80–99       → approaching  (amber)
 *   100–119     → over         (red, still operable)
 *   ≥120        → hard_stop    (red, blocks new additions)
 *   tier=industry → unlimited (any count, no banner)
 *
 * Caps used by the tests (also exercised explicitly via the
 * MAX_ACTIVE_ANIMALS_PER_TIER export so the table stays locked):
 *
 *   free       100
 *   pro      1,000
 *   enterprise 10,000
 *   industry  unlimited (-1)
 */

describe('MAX_ACTIVE_ANIMALS_PER_TIER caps', () => {
  it('locks the four-tier headcount ladder', () => {
    expect(MAX_ACTIVE_ANIMALS_PER_TIER.free).toBe(100);
    expect(MAX_ACTIVE_ANIMALS_PER_TIER.pro).toBe(1_000);
    expect(MAX_ACTIVE_ANIMALS_PER_TIER.enterprise).toBe(10_000);
    expect(MAX_ACTIVE_ANIMALS_PER_TIER.industry).toBe(-1);
  });
});

describe('getMaxActiveAnimals fallback', () => {
  it('returns the Starter cap for unknown / missing tiers', () => {
    expect(getMaxActiveAnimals(undefined)).toBe(100);
    expect(getMaxActiveAnimals(null)).toBe(100);
    expect(getMaxActiveAnimals('garbage')).toBe(100);
  });
});

describe('headcountStatus state transitions (Starter, cap=100)', () => {
  it('ok under 80%', () => {
    expect(headcountStatus('free', 0).state).toBe('ok');
    expect(headcountStatus('free', 50).state).toBe('ok');
    expect(headcountStatus('free', 79).state).toBe('ok');
  });

  it('approaching at 80–99%', () => {
    expect(headcountStatus('free', 80).state).toBe('approaching');
    expect(headcountStatus('free', 95).state).toBe('approaching');
    expect(headcountStatus('free', 99).state).toBe('approaching');
  });

  it('over at 100–119%', () => {
    expect(headcountStatus('free', 100).state).toBe('over');
    expect(headcountStatus('free', 110).state).toBe('over');
    expect(headcountStatus('free', 119).state).toBe('over');
  });

  it('hard_stop at 120% and above', () => {
    expect(headcountStatus('free', 120).state).toBe('hard_stop');
    expect(headcountStatus('free', 200).state).toBe('hard_stop');
    expect(headcountStatus('free', 10_000).state).toBe('hard_stop');
  });
});

describe('headcountStatus by tier', () => {
  it('Industry is always unlimited regardless of count', () => {
    expect(headcountStatus('industry', 0).state).toBe('unlimited');
    expect(headcountStatus('industry', 1_000_000).state).toBe('unlimited');
  });

  it('Grower (pro) cap of 1,000 honors the same thresholds', () => {
    expect(headcountStatus('pro', 500).state).toBe('ok');
    expect(headcountStatus('pro', 800).state).toBe('approaching');
    expect(headcountStatus('pro', 1_000).state).toBe('over');
    expect(headcountStatus('pro', 1_200).state).toBe('hard_stop');
  });

  it('Farm Boss (enterprise) cap of 10,000 honors the same thresholds', () => {
    expect(headcountStatus('enterprise', 7_000).state).toBe('ok');
    expect(headcountStatus('enterprise', 8_000).state).toBe('approaching');
    expect(headcountStatus('enterprise', 10_000).state).toBe('over');
    expect(headcountStatus('enterprise', 12_000).state).toBe('hard_stop');
  });
});

describe('headcountStatus return shape', () => {
  it('non-unlimited tiers carry cap+count+pct', () => {
    const s = headcountStatus('free', 60);
    expect(s.state).toBe('ok');
    expect(s.cap).toBe(100);
    expect(s.count).toBe(60);
    expect(s.pct).toBe(60);
  });

  it('rounds pct (integer) for display', () => {
    expect(headcountStatus('free', 47).pct).toBe(47);
    expect(headcountStatus('pro', 333).pct).toBe(33);   // 333/1000 = 33.3 → 33
    expect(headcountStatus('pro', 666).pct).toBe(67);   // 666/1000 = 66.6 → 67
  });

  it('unlimited returns cap=-1 and pct=0 (avoids divide-by-zero noise)', () => {
    const s = headcountStatus('industry', 42_000);
    expect(s.state).toBe('unlimited');
    if (s.state === 'unlimited') {
      expect(s.cap).toBe(-1);
      expect(s.pct).toBe(0);
      expect(s.count).toBe(42_000);
    }
  });
});
