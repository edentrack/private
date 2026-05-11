/**
 * Shared pricing helper for edge functions.
 *
 * Reads pricing_settings.global_discount_pct from Supabase and caches
 * it in module-level memory for 60s. Edge functions then apply the
 * discount to their hardcoded MIN_AMOUNTS before validating user-
 * submitted payment amounts. This keeps server-side validation in
 * lock-step with whatever the client is currently showing.
 *
 * Usage:
 *   const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
 *   const pct = await getCurrentDiscountPct(supabase);
 *   const effectiveMin = applyDiscount(MIN_AMOUNTS[period][key], pct, decimalsFor(currency));
 *   if (submittedAmount < effectiveMin * 0.99) return reject(); // 1% tolerance for rounding
 *
 * Why 60s cache: pricing changes are rare (super-admin tweak once a
 * quarter), but payment requests are frequent. Reading on every
 * request would add 50-100ms of DB latency to checkout. The 60s
 * staleness window is well within the "no one notices" zone.
 */

// SupabaseClient typing varies by Deno version; keep loose to avoid
// version-pinning headaches across edge functions.
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

let _cachedDiscount = 0;
let _cachedAt = 0;
const _CACHE_TTL_MS = 60_000;

export async function getCurrentDiscountPct(supabase: SupabaseLike): Promise<number> {
  const now = Date.now();
  if (now - _cachedAt < _CACHE_TTL_MS) return _cachedDiscount;
  try {
    const { data } = await supabase
      .from('pricing_settings')
      .select('global_discount_pct')
      .eq('id', 1)
      .maybeSingle();
    _cachedDiscount = Number(data?.global_discount_pct ?? 0);
    _cachedAt = now;
  } catch {
    // Leave cache as-is on failure. Better to charge baseline than to
    // reject every payment because the DB hiccuped.
  }
  return _cachedDiscount;
}

/**
 * Apply percentage discount and round to the currency's natural
 * decimals. Decimals=0 for CFA/NGN/etc, decimals=2 for USD/EUR/GBP.
 */
export function applyDiscount(amount: number, discountPct: number, decimals = 0): number {
  if (discountPct <= 0) return amount;
  const factor = 1 - discountPct / 100;
  const discounted = amount * factor;
  return decimals === 0
    ? Math.round(discounted)
    : Math.round(discounted * 100) / 100;
}

/** Decimals per currency, mirroring the client CURRENCY_FORMAT table. */
export function decimalsFor(currency: string): number {
  const twoDecimal = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD']);
  return twoDecimal.has(currency) ? 2 : 0;
}
