import { describe, it, expect } from 'vitest';
import { hasFeatureAccess } from '../utils/planGating';

/**
 * Regression test for the May 2026 Farm Boss launch-blocker.
 *
 * Symptom: the dashboard's CoreKPISection block was missing on Farm Boss
 * (paid mid-tier, subscription_tier='enterprise'). It rendered fine on
 * Starter and on the top Enterprise (industry) tier — only the mid-tier
 * users couldn't see their headline KPIs.
 *
 * Root cause: DashboardHome was gating on `farm.plan` (a legacy per-farm
 * column, defaulted to 'basic' at insert time, never synced to billing)
 * instead of `profile.subscription_tier` (the per-user column billing
 * actually writes to). A Farm Boss user had farm.plan='basic', and
 * `hasFeatureAccess('basic', 'kpis')` returns false → block hidden.
 *
 * Fix: switched the gate to `profile.subscription_tier` and broadened
 * `hasFeatureAccess` to handle both representations + 'industry'.
 *
 * This test pins the access matrix so the same regression can't slip
 * through again.
 */

describe('hasFeatureAccess — every subscription tier renders correctly', () => {
  // Per-user subscription_tier values from `profiles.subscription_tier`.
  // Greg's 4 marketing tiers map to these as:
  //   Starter   → 'free'
  //   Grower    → 'pro'
  //   Farm Boss → 'enterprise'
  //   Enterprise → 'industry'
  const tiers = ['free', 'pro', 'enterprise', 'industry'] as const;

  describe('kpis access', () => {
    const expected: Record<typeof tiers[number], boolean> = {
      free: false,        // Starter: KPIs are a paid feature
      pro: true,          // Grower
      enterprise: true,   // Farm Boss — was broken pre-fix
      industry: true,     // Enterprise (top tier)
    };

    for (const tier of tiers) {
      it(`tier='${tier}' → kpis = ${expected[tier]}`, () => {
        expect(hasFeatureAccess(tier, 'kpis')).toBe(expected[tier]);
      });
    }
  });

  describe('daily_summary access', () => {
    const expected: Record<typeof tiers[number], boolean> = {
      free: false,
      pro: true,
      enterprise: true,
      industry: true,
    };

    for (const tier of tiers) {
      it(`tier='${tier}' → daily_summary = ${expected[tier]}`, () => {
        expect(hasFeatureAccess(tier, 'daily_summary')).toBe(expected[tier]);
      });
    }
  });

  describe('alerts access', () => {
    const expected: Record<typeof tiers[number], boolean> = {
      free: false,
      pro: true,
      enterprise: true,
      industry: true,
    };

    for (const tier of tiers) {
      it(`tier='${tier}' → alerts = ${expected[tier]}`, () => {
        expect(hasFeatureAccess(tier, 'alerts')).toBe(expected[tier]);
      });
    }
  });

  describe('advanced_analytics access (enterprise+ only)', () => {
    const expected: Record<typeof tiers[number], boolean> = {
      free: false,
      pro: false,
      enterprise: true,
      industry: true,
    };

    for (const tier of tiers) {
      it(`tier='${tier}' → advanced_analytics = ${expected[tier]}`, () => {
        expect(hasFeatureAccess(tier, 'advanced_analytics')).toBe(expected[tier]);
      });
    }
  });

  describe('legacy farm.plan values still resolve', () => {
    // The old per-farm `plan` column has 'basic' | 'pro' | 'enterprise'.
    // Even though we've moved gating to subscription_tier, callers that
    // still pass farm.plan should keep working.
    it('farm.plan="basic" → kpis = false (matches subscription_tier="free")', () => {
      expect(hasFeatureAccess('basic', 'kpis')).toBe(false);
    });

    it('farm.plan="pro" → kpis = true', () => {
      expect(hasFeatureAccess('pro', 'kpis')).toBe(true);
    });

    it('farm.plan="enterprise" → kpis = true', () => {
      expect(hasFeatureAccess('enterprise', 'kpis')).toBe(true);
    });
  });

  describe('null / undefined safety', () => {
    // `profile.subscription_tier` is optional in the type — callers may
    // pass undefined while the profile is still loading. The gate must
    // fail closed (no KPIs) without throwing.
    it('undefined → kpis = false', () => {
      expect(hasFeatureAccess(undefined, 'kpis')).toBe(false);
    });

    it('null → kpis = false', () => {
      expect(hasFeatureAccess(null, 'kpis')).toBe(false);
    });

    it('unknown string → kpis = false', () => {
      expect(hasFeatureAccess('mystery_tier', 'kpis')).toBe(false);
    });
  });
});
