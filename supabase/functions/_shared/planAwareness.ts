/**
 * Eden plan-awareness helpers.
 *
 * Used by `ai-chat/index.ts` to inject the user's plan state into the
 * system prompt so Eden never recommends actions that the paywall will
 * block — e.g. "create a new rabbits farm" when the user is already at
 * their farm cap.
 *
 * Pure functions so vitest can cover them without spinning up Deno.
 */

export type PlanTier = 'free' | 'pro' | 'enterprise' | 'industry';

/**
 * Single source of truth for farm caps per tier. Mirrors the values in
 * `src/utils/planGating.ts` (intentionally duplicated because the edge
 * function can't import frontend code, but tests below pin them).
 */
export const FARM_CAP_BY_TIER: Record<PlanTier, number> = {
  free: 1,
  pro: 2,
  enterprise: 3,
  industry: 999,
};

/**
 * Active animal headcount caps per tier (May 2026 — primary plan
 * metric). Mirrors `MAX_ACTIVE_ANIMALS_PER_TIER` in
 * `src/utils/planGating.ts`. -1 = unlimited (Industry).
 *
 * Eden uses these to refuse "let's add 500 birds" when the farm is
 * already at the cap — same refusal pattern as the farm-count cap.
 */
export const ANIMAL_CAP_BY_TIER: Record<PlanTier, number> = {
  free: 100,
  pro: 1_000,
  enterprise: 10_000,
  industry: -1,
};

export function getAnimalCap(tier: string | null | undefined): number {
  if (!tier) return ANIMAL_CAP_BY_TIER.free;
  const t = tier as PlanTier;
  return ANIMAL_CAP_BY_TIER[t] ?? ANIMAL_CAP_BY_TIER.free;
}

/** Marketing label shown in Eden's prose so users see consistent copy. */
export const TIER_DISPLAY_NAME: Record<PlanTier, string> = {
  free: 'Starter',
  pro: 'Grower',
  enterprise: 'Farm Boss',
  industry: 'Enterprise',
};

export function getFarmCap(tier: string | null | undefined): number {
  if (!tier) return FARM_CAP_BY_TIER.free;
  const t = tier as PlanTier;
  return FARM_CAP_BY_TIER[t] ?? FARM_CAP_BY_TIER.free;
}

export function getTierDisplayName(tier: string | null | undefined): string {
  if (!tier) return TIER_DISPLAY_NAME.free;
  const t = tier as PlanTier;
  return TIER_DISPLAY_NAME[t] ?? TIER_DISPLAY_NAME.free;
}

/**
 * Build the PLAN AWARENESS block for the system prompt.
 *
 * The prompt is split into three guarantees Eden must respect:
 *   1. Refuse cap-busting actions politely + offer the legitimate fix.
 *   2. Surface the upgrade lever once, not repeatedly.
 *   3. Stay accurate when the user IS under the cap (no false urgency).
 *
 * Includes a few-shot example so the model has a concrete pattern to
 * imitate. The example is what the brief explicitly asked for.
 */
export function buildPlanAwarenessNote(opts: {
  tier: string | null | undefined;
  farmsUsed: number;
  farmCap: number;
  /** Optional usage telemetry — surface message limits when known. */
  edenMsgsUsed?: number | null;
  edenMsgsCap?: number | null;
  /**
   * Active animal headcount on the user's currently-selected farm.
   * Sum of `current_count` across active flocks + active
   * rabbit_growout_groups. Eden uses this with `animalCap` below to
   * refuse "let's add 500 birds" when the farm is already at the cap.
   */
  animalsUsed?: number | null;
  animalCap?: number | null;
}): string {
  const tierLabel = getTierDisplayName(opts.tier);
  const { farmsUsed, farmCap } = opts;
  const atCap = farmsUsed >= farmCap;
  const slotsLeft = Math.max(0, farmCap - farmsUsed);

  const farmStateLine = atCap
    ? `🚫 The user is AT THEIR LIMIT (${farmsUsed} of ${farmCap}). Adding ANOTHER farm requires either an upgrade OR removing one of the existing farms first.`
    : `✅ The user has ${slotsLeft} farm slot${slotsLeft === 1 ? '' : 's'} available (${farmsUsed} of ${farmCap}). They CAN create a new farm immediately via Settings → My Farms → Add a new farm.`;

  // Animal-headcount block — included only when caller passes
  // animalsUsed (some prompts that don't yet have the selected farm
  // skip this so we don't show "0 of 100" which reads weird).
  const animalBlock = (() => {
    if (opts.animalsUsed == null || opts.animalCap == null) return '';
    const used = opts.animalsUsed;
    const cap = opts.animalCap;
    if (cap === -1) {
      // Industry tier — no cap. Tell Eden so it never invents one.
      return `\n- Active animals: **${used.toLocaleString()}** (no cap on Industry).`;
    }
    const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
    const overHard = pct >= 120;
    const overCap  = pct >= 100 && pct < 120;
    const near     = pct >= 80 && pct < 100;
    const status = overHard
      ? `🚫 HARD STOP — well over cap. Don't suggest creating new flocks/cohorts; nudge toward upgrading or archiving.`
      : overCap
      ? `⚠️ Over the cap (still operable, but new additions will block at 120%). Mention the upgrade once if relevant.`
      : near
      ? `📈 Approaching the cap. Fine to keep adding small numbers; flag the limit only if the user is planning a big buy-in.`
      : `✅ Plenty of headroom.`;
    return `\n- Active animals: **${used.toLocaleString()} of ${cap.toLocaleString()}** (${pct}%). ${status}`;
  })();

  const msgUsageLine =
    typeof opts.edenMsgsUsed === 'number' && typeof opts.edenMsgsCap === 'number'
      ? `\n- Eden messages this period: ${opts.edenMsgsUsed} of ${opts.edenMsgsCap} ${
          opts.edenMsgsUsed >= opts.edenMsgsCap
            ? '— at cap. Don\'t encourage more long-form analysis until next period.'
            : opts.edenMsgsUsed >= opts.edenMsgsCap * 0.85
            ? '— close to the cap. Be efficient with replies.'
            : ''
        }`
      : '';

  return `

## PLAN AWARENESS — read before suggesting any "create a new" action

The user is on the **${tierLabel}** plan.
- Farms in use: **${farmsUsed} of ${farmCap}**.${msgUsageLine}${animalBlock}

${farmStateLine}

### Refusal/redirect rule (apply when user is at cap)
If the user asks for something that requires a new farm slot when they're already at the cap (e.g. "I want to add rabbits", "let me start a poultry side hustle"), DO NOT say "create a new farm with type X". Instead:
1. Acknowledge the cap warmly: "You're at your farm cap (${farmsUsed} of ${farmCap}) on the ${tierLabel} plan."
2. Offer the two real paths: "You can either upgrade your plan, or remove an unused farm in Settings → My Farms."
3. ONLY after that walk through the species setup details if they want to know what the new farm would look like.

Never repeat the upgrade pitch more than once per topic. Don't be preachy.

### Few-shot — correct refusal pattern

User: "I want to start raising rabbits."
${atCap
    ? `Eden (correct): "Love it — rabbits do well alongside ${tierLabel === 'Starter' ? 'fish or poultry' : 'your existing operation'}. One thing to flag first: you're at your farm cap (${farmsUsed} of ${farmCap}) on the ${tierLabel} plan, so you'd need to either upgrade or remove an unused farm in Settings → My Farms before I can walk you through setup. Want me to show you what's idle, or talk through the upgrade?"`
    : `Eden (correct): "Great — you've got ${slotsLeft} farm slot${slotsLeft === 1 ? '' : 's'} free, so we can spin one up directly. Settings → My Farms → Add a new farm, pick Rabbits as the species. Want me to walk through the doe/buck setup right now or after you create it?"`}

Never produce: "Just go to Settings and create a new farm with type rabbits" without checking the cap first.

`;
}
