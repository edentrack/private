import { FarmPlan } from '../types/database';

// Farm (account-level) limits per subscription tier
export const MAX_FARMS_PER_TIER: Record<string, number> = {
  free:       1,
  pro:        2,
  enterprise: 3,
  industry:   999,
};

export function getMaxFarms(tier: string | undefined | null): number {
  return MAX_FARMS_PER_TIER[tier ?? 'free'] ?? 1;
}

export function atFarmLimit(tier: string | undefined | null, ownedFarmCount: number): boolean {
  return ownedFarmCount >= getMaxFarms(tier);
}

// Active flock limits per subscription tier
export const MAX_FLOCKS_PER_TIER: Record<string, number> = {
  free:       2,
  pro:        5,
  enterprise: 999,
  industry:   999,
};

export function getMaxFlocks(tier: string | undefined | null): number {
  return MAX_FLOCKS_PER_TIER[tier ?? 'free'] ?? 2;
}

export function atFlockLimit(tier: string | undefined | null, activeFlockCount: number): boolean {
  return activeFlockCount >= getMaxFlocks(tier);
}

// Bird count limits per flock per plan
export const MAX_BIRDS_PER_FLOCK: Record<FarmPlan, number> = {
  basic: 500,
  pro: 10_000,
  enterprise: 999_999,
};

export function getMaxBirdsPerFlock(plan: FarmPlan): number {
  return MAX_BIRDS_PER_FLOCK[plan] ?? 500;
}

export function exceedsBirdLimit(plan: FarmPlan, count: number): boolean {
  return count > getMaxBirdsPerFlock(plan);
}

export function isPro(plan: FarmPlan): boolean {
  return plan === 'pro' || plan === 'enterprise';
}

export function isEnterprise(plan: FarmPlan): boolean {
  return plan === 'enterprise';
}

/**
 * Feature gating — May 2026 rewrite.
 *
 * The codebase has two parallel tier columns:
 *   - `farms.plan` (FarmPlan: 'basic' | 'pro' | 'enterprise') — a per-farm
 *     legacy column that's defaulted at insert time and is NOT kept in
 *     sync with billing.
 *   - `profiles.subscription_tier` (SubscriptionTier: 'free' | 'pro' |
 *     'enterprise' | 'industry') — the per-user column that billing
 *     actually writes to.
 *
 * Using `farm.plan` for feature gates was a launch-blocker bug: a Farm
 * Boss user (subscription_tier='enterprise') had farm.plan='basic' from
 * the migration default, so KPIs / alerts / daily summary were hidden.
 *
 * `hasFeatureAccess` now accepts EITHER tier representation. The 'free' /
 * 'basic' aliases collapse, 'industry' is recognised as the top tier
 * (super-set of enterprise), and unknown / undefined values fail closed.
 *
 * Migration plan: callers should be moved to pass `profile.subscription_tier`
 * (the source of truth). The old `farms.plan` column should be deprecated
 * once all gates have been switched.
 */
type AnyTier =
  | FarmPlan
  | NonNullable<import('../types/database').Profile['subscription_tier']>
  | string
  | null
  | undefined;

function isProOrAbove(tier: AnyTier): boolean {
  return tier === 'pro' || tier === 'enterprise' || tier === 'industry';
}

function isEnterpriseOrAbove(tier: AnyTier): boolean {
  return tier === 'enterprise' || tier === 'industry';
}

export function hasFeatureAccess(
  tier: AnyTier,
  feature: 'kpis' | 'alerts' | 'daily_summary' | 'advanced_analytics',
): boolean {
  switch (feature) {
    case 'kpis':
    case 'alerts':
    case 'daily_summary':
      return isProOrAbove(tier);
    case 'advanced_analytics':
      return isEnterpriseOrAbove(tier);
    default:
      return true;
  }
}

export function getPlanName(plan: FarmPlan): string {
  switch (plan) {
    case 'basic':
      return 'Basic';
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
  }
}

export function getPlanFeatures(plan: FarmPlan): string[] {
  const features = [
    'Core farm management',
    'Task management',
    'Basic inventory tracking',
    'Flock management',
  ];

  if (isPro(plan)) {
    features.push(
      'KPIs & Analytics',
      'Smart Alerts',
      'Daily Farm Summary',
      'Advanced Reporting'
    );
  }

  if (isEnterprise(plan)) {
    features.push(
      'Priority Support',
      'Custom Integrations',
      'Multi-farm Management'
    );
  }

  return features;
}
