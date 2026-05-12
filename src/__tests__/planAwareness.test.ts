import { describe, it, expect } from 'vitest';
import {
  FARM_CAP_BY_TIER,
  TIER_DISPLAY_NAME,
  ANIMAL_CAP_BY_TIER,
  buildPlanAwarenessNote,
  getFarmCap,
  getTierDisplayName,
  getAnimalCap,
} from '../../supabase/functions/_shared/planAwareness';

/**
 * Eden plan-awareness contract tests.
 *
 * BUG-031 surfaced because the system prompt had no awareness of the
 * user's farm count vs the plan cap. Eden cheerfully suggested "create a
 * new farm with type rabbits" while the paywall blocked the action.
 *
 * The fix lives in `supabase/functions/_shared/planAwareness.ts` so the
 * edge function and these tests share one source of truth — the prompt
 * cannot drift from the cap math without one of these tests catching it.
 */

describe('FARM_CAP_BY_TIER', () => {
  it('has caps for every supported tier', () => {
    expect(FARM_CAP_BY_TIER.free).toBe(1);
    expect(FARM_CAP_BY_TIER.pro).toBe(2);
    expect(FARM_CAP_BY_TIER.enterprise).toBe(3);
    expect(FARM_CAP_BY_TIER.industry).toBeGreaterThanOrEqual(99);
  });

  it('mirrors the frontend planGating values', () => {
    // If frontend planGating.MAX_FARMS_PER_TIER ever changes, copy the
    // new values into the shared module too — we duplicate intentionally
    // because Deno can't import frontend code, but the values must agree.
    expect(getFarmCap('free')).toBe(1);
    expect(getFarmCap('pro')).toBe(2);
    expect(getFarmCap('enterprise')).toBe(3);
  });

  it('falls back to the free cap for unknown tier strings', () => {
    expect(getFarmCap(undefined)).toBe(FARM_CAP_BY_TIER.free);
    expect(getFarmCap(null)).toBe(FARM_CAP_BY_TIER.free);
    expect(getFarmCap('mystery_tier')).toBe(FARM_CAP_BY_TIER.free);
  });
});

describe('TIER_DISPLAY_NAME', () => {
  it('uses marketing names so the prompt copy matches the website', () => {
    expect(TIER_DISPLAY_NAME.free).toBe('Starter');
    expect(TIER_DISPLAY_NAME.pro).toBe('Grower');
    expect(TIER_DISPLAY_NAME.enterprise).toBe('Farm Boss');
    expect(TIER_DISPLAY_NAME.industry).toBe('Enterprise');
  });

  it('falls back to Starter for unknown tier values', () => {
    expect(getTierDisplayName('foo')).toBe('Starter');
    expect(getTierDisplayName(null)).toBe('Starter');
  });
});

describe('buildPlanAwarenessNote — Starter at cap', () => {
  const note = buildPlanAwarenessNote({
    tier: 'free',
    farmsUsed: 1,
    farmCap: 1,
  });

  it('mentions the cap explicitly with N of N notation', () => {
    expect(note).toContain('1 of 1');
    expect(note).toContain('Starter');
    expect(note).toContain('AT THEIR LIMIT');
  });

  it('refuses cap-busting actions and offers upgrade-or-remove', () => {
    expect(note).toMatch(/upgrade/i);
    expect(note).toMatch(/Settings\s*→\s*My Farms/);
    expect(note).toContain('DO NOT say');
  });

  it('includes a few-shot example that demonstrates the refusal pattern', () => {
    expect(note).toContain('Few-shot');
    expect(note).toMatch(/Eden \(correct\)/);
    expect(note).toMatch(/Never produce:/);
  });
});

describe('buildPlanAwarenessNote — Grower at cap', () => {
  const note = buildPlanAwarenessNote({
    tier: 'pro',
    farmsUsed: 2,
    farmCap: 2,
  });

  it('uses the Grower marketing name', () => {
    expect(note).toContain('Grower');
    expect(note).not.toContain('Starter plan');
  });

  it('still hits the at-cap branch with the right numbers', () => {
    expect(note).toContain('2 of 2');
    expect(note).toContain('AT THEIR LIMIT');
  });
});

describe('buildPlanAwarenessNote — under cap (regression check)', () => {
  it('uses the under-cap copy and does NOT block farm creation', () => {
    const note = buildPlanAwarenessNote({
      tier: 'enterprise',
      farmsUsed: 1,
      farmCap: 3,
    });
    expect(note).toContain('2 farm slots available');
    expect(note).toContain('CAN create a new farm');
    expect(note).not.toContain('AT THEIR LIMIT');
    // The few-shot example for under-cap users walks them through the
    // happy path, NOT the upgrade pitch.
    expect(note).toMatch(/can spin one up directly/i);
  });

  it('singular slot wording when exactly one slot remains', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro',
      farmsUsed: 1,
      farmCap: 2,
    });
    expect(note).toContain('1 farm slot available');
    expect(note).not.toContain('1 farm slots available');
  });
});

describe('buildPlanAwarenessNote — Eden message usage telemetry', () => {
  it('surfaces a "close to cap" warning at >=85%', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro',
      farmsUsed: 1,
      farmCap: 2,
      edenMsgsUsed: 170,
      edenMsgsCap: 200,
    });
    expect(note).toContain('170 of 200');
    expect(note).toMatch(/close to the cap/i);
  });

  it('surfaces an "at cap" message lock when used >= cap', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro',
      farmsUsed: 1,
      farmCap: 2,
      edenMsgsUsed: 200,
      edenMsgsCap: 200,
    });
    expect(note).toMatch(/at cap.*long-form analysis/i);
  });

  it('omits the message-usage line when telemetry is unknown', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro',
      farmsUsed: 1,
      farmCap: 2,
    });
    expect(note).not.toMatch(/Eden messages this period/);
  });
});

describe('buildPlanAwarenessNote — never produce regression', () => {
  it('always includes the explicit "Never produce:" footer so future LLM versions inherit the boundary', () => {
    for (const tier of ['free', 'pro', 'enterprise'] as const) {
      const note = buildPlanAwarenessNote({
        tier,
        farmsUsed: 99,
        farmCap: 99,
      });
      expect(note).toContain('Never produce:');
    }
  });
});

/**
 * Animal-cap awareness (added May 2026).
 *
 * Eden previously only knew the farm-count caps. Without an animal-cap
 * line, it would happily say "let's add 500 birds" to a Starter user
 * already at 100 animals — contradicting the new gating in
 * `MAX_ACTIVE_ANIMALS_PER_TIER`. These tests pin the new line so the
 * prompt and the UI agree on the cap math.
 */
describe('ANIMAL_CAP_BY_TIER', () => {
  it('mirrors the four-tier headcount ladder from planGating.ts', () => {
    expect(ANIMAL_CAP_BY_TIER.free).toBe(100);
    expect(ANIMAL_CAP_BY_TIER.pro).toBe(1_000);
    expect(ANIMAL_CAP_BY_TIER.enterprise).toBe(10_000);
    expect(ANIMAL_CAP_BY_TIER.industry).toBe(-1);
  });
});

describe('getAnimalCap fallback', () => {
  it('returns the Starter cap for missing/unknown tiers', () => {
    expect(getAnimalCap(undefined)).toBe(100);
    expect(getAnimalCap(null)).toBe(100);
    expect(getAnimalCap('something-else')).toBe(100);
  });
});

describe('buildPlanAwarenessNote — animal headcount block', () => {
  it('omits the block when animalsUsed/animalCap are not provided', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro', farmsUsed: 1, farmCap: 2,
    });
    expect(note).not.toContain('Active animals');
  });

  it('shows "plenty of headroom" when under 80% of the cap', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro', farmsUsed: 1, farmCap: 2,
      animalsUsed: 300, animalCap: 1000,
    });
    expect(note).toContain('Active animals');
    expect(note).toContain('300');
    expect(note).toContain('1,000');
    expect(note).toMatch(/Plenty of headroom/i);
  });

  it('flags "approaching the cap" between 80% and 99%', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro', farmsUsed: 1, farmCap: 2,
      animalsUsed: 850, animalCap: 1000,
    });
    expect(note).toMatch(/Approaching the cap/i);
  });

  it('flags "over the cap (still operable)" between 100% and 119%', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro', farmsUsed: 1, farmCap: 2,
      animalsUsed: 1100, animalCap: 1000,
    });
    expect(note).toMatch(/Over the cap/i);
    expect(note).toContain('still operable');
  });

  it('flags HARD STOP at 120% and above', () => {
    const note = buildPlanAwarenessNote({
      tier: 'pro', farmsUsed: 1, farmCap: 2,
      animalsUsed: 1500, animalCap: 1000,
    });
    expect(note).toMatch(/HARD STOP/i);
    expect(note).toMatch(/upgrading or archiving/i);
  });

  it('renders Industry tier as unlimited (no cap math)', () => {
    const note = buildPlanAwarenessNote({
      tier: 'industry', farmsUsed: 1, farmCap: 999,
      animalsUsed: 42_000, animalCap: -1,
    });
    expect(note).toContain('Active animals');
    expect(note).toContain('42,000');
    expect(note).toMatch(/no cap on Industry/i);
  });
});
