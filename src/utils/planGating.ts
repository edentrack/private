import { FarmPlan } from '../types/database';

// Farm (account-level) limits per subscription tier — locked matrix May 2026
export const MAX_FARMS_PER_TIER: Record<string, number> = {
  free:       1,
  pro:        2,    // Grower
  enterprise: 4,    // Farm Boss
  industry:   10,
};

export function getMaxFarms(tier: string | undefined | null): number {
  return MAX_FARMS_PER_TIER[tier ?? 'free'] ?? 1;
}

export function atFarmLimit(tier: string | undefined | null, ownedFarmCount: number): boolean {
  return ownedFarmCount >= getMaxFarms(tier);
}

// ── Active animal headcount caps (May 2026 — primary plan metric) ────
//
// Why headcount: a rabbit doe can fill the flock-count cap by herself
// in 3 months by kindling monthly. Counting flocks/cohorts doesn't
// match how a farm grows — counting LIVE animals does. The plan card
// copy already says "50 to 500 animals" / "Commercial farm" — this
// matches enforcement to that copy.
//
// We count `current_count` across all active flocks +
// rabbit_growout_groups per FARM (one farm at a time — multi-farm
// owners hit the per-farm cap independently).
//
// Behavior thresholds (see headcountStatus below):
//   - Under cap        → no banner, full freedom
//   - 80–100% of cap   → amber "approaching limit" banner
//   - 100–120% of cap  → red "above plan limit" banner, still works
//   - >120% of cap     → hard stop on new additions
//
// -1 = unlimited (Industry).
export const MAX_ACTIVE_ANIMALS_PER_TIER: Record<string, number> = {
  free:       100,
  pro:        1_000,    // Grower
  enterprise: 10_000,   // Farm Boss
  industry:   -1,       // unlimited
};

export function getMaxActiveAnimals(tier: string | undefined | null): number {
  return MAX_ACTIVE_ANIMALS_PER_TIER[tier ?? 'free'] ?? 100;
}

export type HeadcountStatus =
  | { state: 'ok';            cap: number; count: number; pct: number }
  | { state: 'approaching';   cap: number; count: number; pct: number }
  | { state: 'over';          cap: number; count: number; pct: number }
  | { state: 'hard_stop';     cap: number; count: number; pct: number }
  | { state: 'unlimited';     cap: -1;     count: number; pct: 0    };

/**
 * Map (tier, current animal count) → behavior state used by the banner
 * + the OverflowModal guard. Industry returns 'unlimited' regardless.
 *
 * Anchors:
 *   pct < 80   → ok           (no UI)
 *   80–99      → approaching  (amber banner, upgrade CTA)
 *   100–119    → over         (red banner, still allow ops)
 *   ≥ 120      → hard_stop    (red banner, block new additions)
 */
export function headcountStatus(
  tier: string | undefined | null,
  count: number,
): HeadcountStatus {
  const cap = getMaxActiveAnimals(tier);
  if (cap === -1) return { state: 'unlimited', cap: -1, count, pct: 0 };
  const pct = cap > 0 ? Math.round((count / cap) * 100) : 0;
  if (pct >= 120) return { state: 'hard_stop',   cap, count, pct };
  if (pct >= 100) return { state: 'over',        cap, count, pct };
  if (pct >= 80)  return { state: 'approaching', cap, count, pct };
  return            { state: 'ok',           cap, count, pct };
}

// Active flocks PER FARM limit per subscription tier — kept as a
// secondary safety net so a Starter farmer doesn't open 50 flocks
// with 1 bird each to game the headcount cap. Generous values; the
// real enforcement is via MAX_ACTIVE_ANIMALS_PER_TIER above.
export const MAX_FLOCKS_PER_TIER: Record<string, number> = {
  free:       2,
  pro:        4,    // Grower
  enterprise: 10,   // Farm Boss
  industry:   20,
};

export function getMaxFlocks(tier: string | undefined | null): number {
  return MAX_FLOCKS_PER_TIER[tier ?? 'free'] ?? 2;
}

export function atFlockLimit(tier: string | undefined | null, activeFlockCount: number): boolean {
  return activeFlockCount >= getMaxFlocks(tier);
}

// Team members per tier — locked matrix May 2026
export const MAX_TEAM_MEMBERS_PER_TIER: Record<string, number> = {
  free:       1,
  pro:        4,
  enterprise: 999,
  industry:   999,
};

export function getMaxTeamMembers(tier: string | undefined | null): number {
  return MAX_TEAM_MEMBERS_PER_TIER[tier ?? 'free'] ?? 1;
}

// Eden AI message limits PER WEEK — locked matrix May 2026
export const EDEN_MESSAGES_PER_WEEK: Record<string, number> = {
  free:       15,
  pro:        100,
  enterprise: 500,
  industry:   -1,   // unlimited
};

export function getEdenMessageLimit(tier: string | undefined | null): number {
  return EDEN_MESSAGES_PER_WEEK[tier ?? 'free'] ?? 15;
}

// Photo disease diagnosis PER MONTH — locked matrix May 2026
export const PHOTO_DIAGNOSIS_PER_MONTH: Record<string, number> = {
  free:       0,
  pro:        3,
  enterprise: 10,
  industry:   -1,   // unlimited
};

export function getPhotoDiagnosisLimit(tier: string | undefined | null): number {
  return PHOTO_DIAGNOSIS_PER_MONTH[tier ?? 'free'] ?? 0;
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
  feature:
    | 'kpis'
    | 'alerts'
    | 'daily_summary'
    | 'advanced_analytics'
    | 'voice_messages'           // Grower+
    | 'photo_diagnosis'          // Grower+ (with monthly cap)
    | 'whatsapp_receipts'        // Grower+
    | 'reports_export'           // Grower+
    | 'csv_import'               // Grower+
    | 'payroll'                  // Grower+
    | 'custom_onboarding'        // Grower+
    | 'priority_support'         // Farm Boss+
    | 'cooperative_dashboard'    // Industry only
    | 'founder_support',         // Industry only
): boolean {
  switch (feature) {
    case 'kpis':
    case 'alerts':
    case 'daily_summary':
    case 'voice_messages':
    case 'photo_diagnosis':
    case 'whatsapp_receipts':
    case 'reports_export':
    case 'csv_import':
    case 'payroll':
    case 'custom_onboarding':
      return isProOrAbove(tier);
    case 'advanced_analytics':
    case 'priority_support':
      return isEnterpriseOrAbove(tier);
    case 'cooperative_dashboard':
    case 'founder_support':
      return tier === 'industry';
    default:
      return true;
  }
}

/**
 * Returns the user's effective subscription tier, accounting for the
 * 30-day Grower trial that new signups get automatically.
 *
 * If the user is on Free but their trial_grower_until is still in the
 * future, they get Grower-tier access until that timestamp passes.
 * After that, getEffectiveTier() returns 'free' and OverflowModal
 * kicks in if they have Grower-level data they need to scale back.
 *
 * Paid subscribers (subscription_tier !== 'free') are NEVER affected
 * by the trial check — their actual tier wins.
 */
export function getEffectiveTier(
  profile: Pick<import('../types/database').Profile, 'subscription_tier' | 'trial_grower_until'> | null | undefined,
): 'free' | 'pro' | 'enterprise' | 'industry' {
  const baseTier = (profile?.subscription_tier ?? 'free') as 'free' | 'pro' | 'enterprise' | 'industry';
  if (baseTier !== 'free') return baseTier;

  const trialUntil = profile?.trial_grower_until;
  if (!trialUntil) return 'free';

  const now = Date.now();
  const trialEnds = typeof trialUntil === 'string' ? Date.parse(trialUntil) : new Date(trialUntil).getTime();
  if (Number.isFinite(trialEnds) && trialEnds > now) {
    return 'pro';   // Grower-tier access during trial window
  }
  return 'free';
}

/**
 * Returns days remaining in the Grower trial. Returns 0 if no trial
 * active or if the user is on a paid plan. Useful for UI countdowns.
 */
export function getTrialDaysRemaining(
  profile: Pick<import('../types/database').Profile, 'subscription_tier' | 'trial_grower_until'> | null | undefined,
): number {
  if (!profile || profile.subscription_tier !== 'free' || !profile.trial_grower_until) return 0;
  const trialEnds = typeof profile.trial_grower_until === 'string'
    ? Date.parse(profile.trial_grower_until)
    : new Date(profile.trial_grower_until).getTime();
  if (!Number.isFinite(trialEnds)) return 0;
  const msRemaining = trialEnds - Date.now();
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
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
