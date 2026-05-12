/**
 * Payment routing — May 2026 rewrite.
 *
 * Until now each country had a single `processor` (stripe OR
 * flutterwave) and a single global default. The new model:
 *
 *   Per country we declare a list of `paymentOptions`. Each option
 *   has its OWN processor:
 *
 *     - CARD payments  → Stripe   (works globally for Visa/MC).
 *                        African cards charge in USD via Stripe.
 *     - LOCAL methods  → Flutterwave (mobile money, bank transfer,
 *                        USSD, wallets). Charges in the local
 *                        currency the country natively uses.
 *
 *   The user picks a method in the Subscribe screen; we route to
 *   the matching processor with the option's `chargeCurrency`.
 *
 * The legacy `processor` / `processorLabel` / `paymentMethods` fields
 * are kept here as DERIVED values (computed from the first option in
 * paymentOptions) so older readers — landing page price labels, etc.
 * — keep working unchanged during the transition.
 */
export type PaymentProcessor = 'stripe' | 'flutterwave';

export type PaymentMethodKind =
  | 'card'           // Visa / Mastercard / Apple Pay / Google Pay
  | 'mobile_money'   // MTN MoMo, M-Pesa, Orange Money, Airtel Money, etc.
  | 'bank'           // Bank transfer, EFT, SEPA, iDEAL
  | 'ussd'           // USSD code (Nigeria etc.)
  | 'wallet';        // Vodafone Cash, Fawry, EcoCash, Wave, etc.

export interface PaymentOption {
  /** Stable id, unique within a country. Used by the UI for select state. */
  id: string;
  /** Human label shown on the method tile, e.g. "Card (Visa / Mastercard)". */
  label: string;
  /** Which processor handles checkout when this method is picked. */
  processor: PaymentProcessor;
  /** Coarse method type — drives icon and grouping in the UI. */
  kind: PaymentMethodKind;
  /**
   * If set, the checkout charges in this currency, NOT the country's
   * default. Used for African cards → Stripe charges in USD because
   * Stripe doesn't settle in most African local currencies. Local
   * methods always charge in the country's native currency.
   */
  chargeCurrency?: string;
}

export interface RegionConfig {
  countryCode: string;
  countryName: string;
  /** Native pricing currency. Mobile-money / bank methods charge in this. */
  currency: string;
  /** Ordered list — first option is the default selection. */
  paymentOptions: PaymentOption[];
  phonePrefix: string;
  needsPhone: boolean;

  // ── Derived (legacy) — DO NOT add new readers, prefer paymentOptions ──
  /** First option's processor. Old callers (landing page) still read this. */
  processor: PaymentProcessor;
  /** "Card / Mobile Money" — human one-liner from option labels. */
  processorLabel: string;
  /** Flat string list (option labels). Old "Accepted: X · Y" footers. */
  paymentMethods: string[];
}

// ── Method factories — saves a lot of repetition in COUNTRY_CONFIGS ──

const m = {
  card: (chargeCurrency?: string): PaymentOption => ({
    id: 'card',
    label: 'Card (Visa / Mastercard)',
    processor: 'stripe',
    kind: 'card',
    chargeCurrency,
  }),
  applePay: (): PaymentOption => ({ id: 'apple_pay', label: 'Apple Pay', processor: 'stripe', kind: 'card' }),
  googlePay: (): PaymentOption => ({ id: 'google_pay', label: 'Google Pay', processor: 'stripe', kind: 'card' }),
  sepa: (): PaymentOption => ({ id: 'sepa', label: 'SEPA Direct Debit', processor: 'stripe', kind: 'bank' }),
  ideal: (): PaymentOption => ({ id: 'ideal', label: 'iDEAL', processor: 'stripe', kind: 'bank' }),

  // Local — Flutterwave. We tag id with the method so the UI can icon it.
  mtnMomo: (): PaymentOption =>   ({ id: 'mtn_momo',    label: 'MTN Mobile Money', processor: 'flutterwave', kind: 'mobile_money' }),
  orangeMoney: (): PaymentOption => ({ id: 'orange_money', label: 'Orange Money',  processor: 'flutterwave', kind: 'mobile_money' }),
  airtelMoney: (): PaymentOption => ({ id: 'airtel_money', label: 'Airtel Money',  processor: 'flutterwave', kind: 'mobile_money' }),
  mpesa: (): PaymentOption =>     ({ id: 'mpesa',       label: 'M-Pesa',           processor: 'flutterwave', kind: 'mobile_money' }),
  tigoPesa: (): PaymentOption =>  ({ id: 'tigo_pesa',   label: 'Tigo Pesa',        processor: 'flutterwave', kind: 'mobile_money' }),
  moovMoney: (): PaymentOption => ({ id: 'moov_money',  label: 'Moov Money',       processor: 'flutterwave', kind: 'mobile_money' }),
  vodafoneCash: (): PaymentOption => ({ id: 'vodafone_cash', label: 'Vodafone Cash', processor: 'flutterwave', kind: 'wallet' }),
  ecocash: (): PaymentOption =>   ({ id: 'ecocash',     label: 'EcoCash',          processor: 'flutterwave', kind: 'wallet' }),
  fawry: (): PaymentOption =>     ({ id: 'fawry',       label: 'Fawry',            processor: 'flutterwave', kind: 'wallet' }),
  wave: (): PaymentOption =>      ({ id: 'wave',        label: 'Wave',             processor: 'flutterwave', kind: 'mobile_money' }),
  tmoney: (): PaymentOption =>    ({ id: 't_money',     label: 'T-Money',          processor: 'flutterwave', kind: 'mobile_money' }),
  flooz: (): PaymentOption =>     ({ id: 'flooz',       label: 'Flooz',            processor: 'flutterwave', kind: 'mobile_money' }),
  freeMoney: (): PaymentOption => ({ id: 'free_money',  label: 'Free Money',       processor: 'flutterwave', kind: 'mobile_money' }),
  bankTransfer: (): PaymentOption => ({ id: 'bank_transfer', label: 'Bank Transfer', processor: 'flutterwave', kind: 'bank' }),
  ussd: (): PaymentOption =>      ({ id: 'ussd',        label: 'USSD',             processor: 'flutterwave', kind: 'ussd' }),
  eft: (): PaymentOption =>       ({ id: 'eft',         label: 'EFT',              processor: 'flutterwave', kind: 'bank' }),
};

/**
 * Compose a RegionConfig given a country code, name, currency, options,
 * and phone prefix. Derives the legacy fields from the option list so
 * old readers (landing page, footer) keep working.
 */
function makeRegion(args: {
  code: string; name: string; currency: string;
  options: PaymentOption[]; phonePrefix: string;
}): RegionConfig {
  const { code, name, currency, options, phonePrefix } = args;
  const primary = options[0];
  return {
    countryCode: code,
    countryName: name,
    currency,
    paymentOptions: options,
    phonePrefix,
    needsPhone: false,
    processor: primary.processor,
    processorLabel: options.map(o => o.label.split(' (')[0]).slice(0, 3).join(' / '),
    paymentMethods: options.map(o => o.label),
  };
}

// Fixed prices per currency — set once, never fluctuate.
//
// THIS IS THE SOURCE OF TRUTH. Landing page, in-app billing,
// checkout modal, Stripe/Flutterwave/Paystack edge functions all
// read from here. Edit this table and every surface picks it up
// on the next build.
//
// USD ladder is $7 / $19 / $49 monthly — Grower / Farm Boss /
// Industry. Quarterly carries an ~17% discount (≈ $6/mo for Grower
// effective), yearly carries an ~25–29% discount. Other currencies
// scaled to roughly match purchasing-power equivalents in each
// market, then rounded to clean local numbers.
export const FIXED_PRICES: Record<string, Record<string, Record<string, number>>> = {
  USD: {
    monthly:   { pro: 7,   enterprise: 19,  industry: 49  },
    quarterly: { pro: 18,  enterprise: 50,  industry: 130 },
    yearly:    { pro: 60,  enterprise: 180, industry: 480 },
  },
  XAF: {
    monthly:   { pro: 4500,  enterprise: 12000,  industry: 30000  },
    quarterly: { pro: 11000, enterprise: 30000,  industry: 77000  },
    yearly:    { pro: 39000, enterprise: 108000, industry: 285000 },
  },
  XOF: {
    monthly:   { pro: 4500,  enterprise: 12000,  industry: 30000  },
    quarterly: { pro: 11000, enterprise: 30000,  industry: 77000  },
    yearly:    { pro: 39000, enterprise: 108000, industry: 285000 },
  },
  NGN: {
    monthly:   { pro: 11000,  enterprise: 32000,  industry: 84000   },
    quarterly: { pro: 28000,  enterprise: 80000,  industry: 205000  },
    yearly:    { pro: 100000, enterprise: 280000, industry: 745000  },
  },
  GHS: {
    monthly:   { pro: 105,  enterprise: 320,  industry: 840  },
    quarterly: { pro: 270,  enterprise: 780,  industry: 2000 },
    yearly:    { pro: 950,  enterprise: 2700, industry: 7200 },
  },
  KES: {
    monthly:   { pro: 900,  enterprise: 2700,  industry: 7100  },
    quarterly: { pro: 2300, enterprise: 6600,  industry: 16800 },
    yearly:    { pro: 8100, enterprise: 22600, industry: 60300 },
  },
  ZAR: {
    monthly:   { pro: 130,  enterprise: 380,  industry: 970   },
    quarterly: { pro: 325,  enterprise: 935,  industry: 2380  },
    yearly:    { pro: 1155, enterprise: 3250, industry: 8580  },
  },
  UGX: {
    monthly:   { pro: 26000,  enterprise: 77000,  industry: 207000   },
    quarterly: { pro: 64000,  enterprise: 187000, industry: 482000   },
    yearly:    { pro: 232000, enterprise: 651000, industry: 1757000  },
  },
  TZS: {
    monthly:   { pro: 19000,  enterprise: 55000,  industry: 142000   },
    quarterly: { pro: 46000,  enterprise: 134000, industry: 341000   },
    yearly:    { pro: 165000, enterprise: 465000, industry: 1230000  },
  },
  RWF: {
    monthly:   { pro: 9500,  enterprise: 28000,  industry: 75000  },
    quarterly: { pro: 23000, enterprise: 68000,  industry: 174000 },
    yearly:    { pro: 84000, enterprise: 234000, industry: 626000 },
  },
  EGP: {
    monthly:   { pro: 330,  enterprise: 1000, industry: 2640  },
    quarterly: { pro: 835,  enterprise: 2400, industry: 6180  },
    yearly:    { pro: 3000, enterprise: 8350, industry: 22270 },
  },
  MAD: {
    monthly:   { pro: 70,   enterprise: 220,  industry: 570  },
    quarterly: { pro: 175,  enterprise: 505,  industry: 1290 },
    yearly:    { pro: 625,  enterprise: 1740, industry: 4640 },
  },
  ZMW: {
    monthly:   { pro: 185,  enterprise: 580,  industry: 1550  },
    quarterly: { pro: 470,  enterprise: 1360, industry: 3475  },
    yearly:    { pro: 1690, enterprise: 4700, industry: 12525 },
  },
  EUR: {
    monthly:   { pro: 6.99,  enterprise: 17.99,  industry: 47.99  },
    quarterly: { pro: 16.99, enterprise: 45.99,  industry: 119.99 },
    yearly:    { pro: 59.99, enterprise: 159.99, industry: 429.99 },
  },
  GBP: {
    monthly:   { pro: 5.99,  enterprise: 14.99,  industry: 39.99  },
    quarterly: { pro: 14.99, enterprise: 39.99,  industry: 99.99  },
    yearly:    { pro: 53.99, enterprise: 139.99, industry: 369.99 },
  },
  CAD: {
    monthly:   { pro: 8.99,  enterprise: 25.99,  industry: 64.99  },
    quarterly: { pro: 22.99, enterprise: 64.99,  industry: 169.99 },
    yearly:    { pro: 84.99, enterprise: 239.99, industry: 629.99 },
  },
  AUD: {
    monthly:   { pro: 10.99,  enterprise: 29.99,  industry: 79.99  },
    quarterly: { pro: 26.99,  enterprise: 76.99,  industry: 199.99 },
    yearly:    { pro: 99.99,  enterprise: 269.99, industry: 729.99 },
  },
};

// Currency formatting
const CURRENCY_FORMAT: Record<string, { prefix: string; suffix: string; decimals: number }> = {
  USD: { prefix: '$',     suffix: '',     decimals: 2 },
  XAF: { prefix: '',     suffix: ' XAF', decimals: 0 },
  XOF: { prefix: '',     suffix: ' CFA', decimals: 0 },
  NGN: { prefix: '₦',    suffix: '',     decimals: 0 },
  GHS: { prefix: 'GH₵',  suffix: '',     decimals: 0 },
  KES: { prefix: 'KSh ', suffix: '',     decimals: 0 },
  ZAR: { prefix: 'R',    suffix: '',     decimals: 0 },
  UGX: { prefix: 'UGX ',suffix: '',     decimals: 0 },
  TZS: { prefix: 'TZS ',suffix: '',     decimals: 0 },
  RWF: { prefix: 'RWF ',suffix: '',     decimals: 0 },
  EGP: { prefix: 'E£',  suffix: '',     decimals: 0 },
  MAD: { prefix: 'MAD ',suffix: '',     decimals: 0 },
  ZMW: { prefix: 'K',   suffix: '',     decimals: 0 },
  EUR: { prefix: '€',    suffix: '',     decimals: 2 },
  GBP: { prefix: '£',    suffix: '',     decimals: 2 },
  CAD: { prefix: 'CA$',  suffix: '',     decimals: 2 },
  AUD: { prefix: 'AU$',  suffix: '',     decimals: 2 },
};

export function formatPrice(amount: number, currency: string): string {
  const fmt = CURRENCY_FORMAT[currency] || CURRENCY_FORMAT.USD;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: fmt.decimals,
    maximumFractionDigits: fmt.decimals,
  });
  return `${fmt.prefix}${formatted}${fmt.suffix}`;
}

export function getPrice(plan: string, billing: 'monthly' | 'quarterly' | 'yearly', currency: string): number {
  const table = FIXED_PRICES[currency] || FIXED_PRICES.USD;
  return table[billing]?.[plan] ?? FIXED_PRICES.USD[billing][plan];
}

export function getPriceCurrency(region: RegionConfig): string {
  return FIXED_PRICES[region.currency] ? region.currency : 'USD';
}

/* ──────────────────────────────────────────────────────────────────────
 * Dynamic pricing (admin-editable discount + per-cell overrides)
 *
 * Architecture:
 *   - FIXED_PRICES is the BASELINE (committed in source)
 *   - pricing_settings.global_discount_pct is a knob the super-admin
 *     can adjust live to apply X% off across the whole catalog
 *   - pricing_overrides lets the admin replace individual cells
 *     (e.g. "Farm Boss NGN monthly = ₦25,000")
 *
 *   Effective price = override ?? baseline × (1 - discount/100)
 *
 * Both tables are public-read so the landing page can show
 * accurate prices before the user logs in. The discount + overrides
 * are cached in module-level memory after the first fetch (until
 * the page reloads), so we don't hit the DB on every render.
 * ─────────────────────────────────────────────────────────────────── */

interface PricingOverride {
  tier: string;
  cycle: string;
  currency: string;
  amount: number;
}

let _cachedDiscountPct = 0;
let _cachedOverrides: PricingOverride[] = [];
let _settingsLoadedAt = 0;
const _CACHE_TTL_MS = 5 * 60_000; // 5 min

/**
 * Pull the current pricing settings + active overrides from Supabase.
 * Called on app boot from src/main.tsx and again on cache miss.
 * Safe to call multiple times — short-circuits when cache is fresh.
 *
 * Pass `{ force: true }` to bypass the 5-minute TTL. The super-admin
 * Pricing screen calls this after Save so the "Effective prices
 * preview" table reflects the new discount immediately instead of
 * stale-reading the local cache until next page load.
 *
 * Uses a dynamic import for the supabase client so this util stays
 * usable in edge-function-adjacent code paths that don't ship the
 * full client.
 */
export async function loadPricingSettings(opts: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (!opts.force && now - _settingsLoadedAt < _CACHE_TTL_MS) return;
  try {
    const { supabase } = await import('../lib/supabaseClient');
    // Run the two reads in parallel — both are tiny.
    const [{ data: settingsRow }, { data: overrideRows }] = await Promise.all([
      supabase.from('pricing_settings').select('global_discount_pct').eq('id', 1).maybeSingle(),
      supabase.from('pricing_overrides').select('tier, cycle, currency, amount').eq('active', true),
    ]);
    _cachedDiscountPct = Number(settingsRow?.global_discount_pct ?? 0);
    _cachedOverrides = (overrideRows as PricingOverride[] | null) ?? [];
    _settingsLoadedAt = now;
  } catch (err) {
    // If the DB is unreachable, leave the cache as-is (defaults to no
    // discount, no overrides). Surface to console for diagnostics but
    // never throw — broken pricing UI is worse than non-discounted.
    console.warn('[regionalPayment] Could not load pricing settings:', err);
  }
}

/**
 * Synchronous read of the cached effective price. Call after
 * loadPricingSettings() has resolved at least once. If not yet
 * loaded, this returns the baseline price (no discount, no override)
 * — acceptable because we always trigger loadPricingSettings() on
 * app boot and the first render is rarely a pricing screen.
 */
export function getEffectivePrice(
  plan: string,
  billing: 'monthly' | 'quarterly' | 'yearly',
  currency: string,
): number {
  // 1. Override wins outright.
  const override = _cachedOverrides.find(
    o => o.tier === plan && o.cycle === billing && o.currency === currency,
  );
  if (override) return override.amount;

  // 2. Baseline × (1 - discount/100). Round to the currency's
  //    natural decimals to avoid showing $6.299999 etc.
  const baseline = getPrice(plan, billing, currency);
  if (_cachedDiscountPct <= 0) return baseline;
  const decimals = CURRENCY_FORMAT[currency]?.decimals ?? 0;
  const factor = 1 - _cachedDiscountPct / 100;
  const discounted = baseline * factor;
  return decimals === 0
    ? Math.round(discounted)
    : Math.round(discounted * 100) / 100;
}

/** Read the currently-cached discount % (0 if never loaded). */
export function getCurrentDiscountPct(): number {
  return _cachedDiscountPct;
}

// ── Region configs ──────────────────────────────────────────────────────

const TZ_TO_COUNTRY: Record<string, string> = {
  // Central Africa
  'Africa/Douala': 'CM', 'Africa/Bangui': 'CF', 'Africa/Libreville': 'GA',
  'Africa/Ndjamena': 'TD', 'Africa/Brazzaville': 'CG', 'Africa/Kinshasa': 'CD',
  'Africa/Lubumbashi': 'CD',
  // West Africa
  'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Abidjan': 'CI',
  'Africa/Dakar': 'SN', 'Africa/Bamako': 'ML', 'Africa/Ouagadougou': 'BF',
  'Africa/Niamey': 'NE', 'Africa/Lome': 'TG', 'Africa/Cotonou': 'BJ',
  'Africa/Conakry': 'GN', 'Africa/Freetown': 'SL', 'Africa/Monrovia': 'LR',
  'Africa/Banjul': 'GM', 'Africa/Bissau': 'GW',
  // East Africa
  'Africa/Nairobi': 'KE', 'Africa/Addis_Ababa': 'ET', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kampala': 'UG', 'Africa/Kigali': 'RW', 'Africa/Djibouti': 'DJ',
  'Africa/Mogadishu': 'SO', 'Africa/Asmara': 'ER', 'Africa/Juba': 'SS',
  // North Africa
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Tunis': 'TN',
  'Africa/Tripoli': 'LY', 'Africa/Algiers': 'DZ',
  // Southern Africa
  'Africa/Johannesburg': 'ZA', 'Africa/Lusaka': 'ZM', 'Africa/Harare': 'ZW',
  'Africa/Blantyre': 'MW', 'Africa/Maputo': 'MZ', 'Africa/Gaborone': 'BW',
  'Africa/Windhoek': 'NA', 'Africa/Mbabane': 'SZ', 'Africa/Maseru': 'LS',
  // Americas
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Los_Angeles': 'US',
  'America/Denver': 'US', 'America/Phoenix': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  // Europe
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL',
  // Oceania
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
};

/**
 * Country configs. Pattern:
 *   - African country with native currency: card → Stripe (USD), local
 *     methods (mobile money / bank / USSD) → Flutterwave (native cur).
 *   - African country billing in USD: card → Stripe (USD), local
 *     methods → Flutterwave (USD).
 *   - Non-African: all Stripe in native currency. No Flutterwave.
 */
export const COUNTRY_CONFIGS: Record<string, RegionConfig> = {
  // ── Africa — local currency countries ──────────────────────────────────
  // For these, card pays via Stripe in USD; local methods via Flutterwave
  // in the native currency (NGN, KES, etc.).
  NG: makeRegion({ code: 'NG', name: 'Nigeria',       currency: 'NGN', phonePrefix: '+234',
    options: [m.card('USD'), m.bankTransfer(), m.ussd(), m.mtnMomo()] }),
  GH: makeRegion({ code: 'GH', name: 'Ghana',         currency: 'GHS', phonePrefix: '+233',
    options: [m.card('USD'), m.mtnMomo(), m.vodafoneCash()] }),
  KE: makeRegion({ code: 'KE', name: 'Kenya',         currency: 'KES', phonePrefix: '+254',
    options: [m.card('USD'), m.mpesa()] }),
  ZA: makeRegion({ code: 'ZA', name: 'South Africa',  currency: 'ZAR', phonePrefix: '+27',
    options: [m.card('USD'), m.eft()] }),
  UG: makeRegion({ code: 'UG', name: 'Uganda',        currency: 'UGX', phonePrefix: '+256',
    options: [m.card('USD'), m.mtnMomo(), m.airtelMoney()] }),
  TZ: makeRegion({ code: 'TZ', name: 'Tanzania',      currency: 'TZS', phonePrefix: '+255',
    options: [m.card('USD'), m.mpesa(), m.tigoPesa(), m.airtelMoney()] }),
  RW: makeRegion({ code: 'RW', name: 'Rwanda',        currency: 'RWF', phonePrefix: '+250',
    options: [m.card('USD'), m.mtnMomo(), m.airtelMoney()] }),
  ZM: makeRegion({ code: 'ZM', name: 'Zambia',        currency: 'ZMW', phonePrefix: '+260',
    options: [m.card('USD'), m.mtnMomo(), m.airtelMoney()] }),
  EG: makeRegion({ code: 'EG', name: 'Egypt',         currency: 'EGP', phonePrefix: '+20',
    options: [m.card('USD'), m.vodafoneCash(), m.fawry()] }),
  MA: makeRegion({ code: 'MA', name: 'Morocco',       currency: 'MAD', phonePrefix: '+212',
    options: [m.card('USD')] }),
  CM: makeRegion({ code: 'CM', name: 'Cameroon',      currency: 'XAF', phonePrefix: '+237',
    options: [m.card('USD'), m.mtnMomo(), m.orangeMoney()] }),
  CI: makeRegion({ code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', phonePrefix: '+225',
    options: [m.card('USD'), m.mtnMomo(), m.orangeMoney(), m.wave()] }),
  SN: makeRegion({ code: 'SN', name: 'Senegal',       currency: 'XOF', phonePrefix: '+221',
    options: [m.card('USD'), m.wave(), m.orangeMoney(), m.freeMoney()] }),
  ML: makeRegion({ code: 'ML', name: 'Mali',          currency: 'XOF', phonePrefix: '+223',
    options: [m.card('USD'), m.orangeMoney(), m.moovMoney()] }),
  BF: makeRegion({ code: 'BF', name: 'Burkina Faso',  currency: 'XOF', phonePrefix: '+226',
    options: [m.card('USD'), m.orangeMoney(), m.moovMoney()] }),
  NE: makeRegion({ code: 'NE', name: 'Niger',         currency: 'XOF', phonePrefix: '+227',
    options: [m.card('USD'), m.airtelMoney(), m.orangeMoney()] }),
  TG: makeRegion({ code: 'TG', name: 'Togo',          currency: 'XOF', phonePrefix: '+228',
    options: [m.card('USD'), m.tmoney(), m.flooz()] }),
  BJ: makeRegion({ code: 'BJ', name: 'Benin',         currency: 'XOF', phonePrefix: '+229',
    options: [m.card('USD'), m.mtnMomo(), m.moovMoney()] }),

  // ── Africa — countries billing in USD ──────────────────────────────────
  // Same idea but the local-method currency is also USD.
  ET: makeRegion({ code: 'ET', name: 'Ethiopia',     currency: 'USD', phonePrefix: '+251',
    options: [m.card()] }),
  ZW: makeRegion({ code: 'ZW', name: 'Zimbabwe',     currency: 'USD', phonePrefix: '+263',
    options: [m.card(), m.ecocash()] }),
  MZ: makeRegion({ code: 'MZ', name: 'Mozambique',   currency: 'USD', phonePrefix: '+258',
    options: [m.card(), m.mpesa()] }),
  MW: makeRegion({ code: 'MW', name: 'Malawi',       currency: 'USD', phonePrefix: '+265',
    options: [m.card(), m.airtelMoney()] }),
  GN: makeRegion({ code: 'GN', name: 'Guinea',       currency: 'USD', phonePrefix: '+224',
    options: [m.card(), m.orangeMoney(), m.mtnMomo()] }),
  SL: makeRegion({ code: 'SL', name: 'Sierra Leone', currency: 'USD', phonePrefix: '+232',
    options: [m.card(), m.orangeMoney()] }),
  LR: makeRegion({ code: 'LR', name: 'Liberia',      currency: 'USD', phonePrefix: '+231',
    options: [m.card()] }),
  GM: makeRegion({ code: 'GM', name: 'Gambia',       currency: 'USD', phonePrefix: '+220',
    options: [m.card()] }),

  // ── Stripe-only — US, UK, Europe, Oceania ──────────────────────────────
  US: makeRegion({ code: 'US', name: 'United States',   currency: 'USD', phonePrefix: '+1',
    options: [m.card(), m.applePay(), m.googlePay()] }),
  GB: makeRegion({ code: 'GB', name: 'United Kingdom',  currency: 'GBP', phonePrefix: '+44',
    options: [m.card(), m.applePay(), m.googlePay()] }),
  FR: makeRegion({ code: 'FR', name: 'France',          currency: 'EUR', phonePrefix: '+33',
    options: [m.card()] }),
  DE: makeRegion({ code: 'DE', name: 'Germany',         currency: 'EUR', phonePrefix: '+49',
    options: [m.card(), m.sepa()] }),
  NL: makeRegion({ code: 'NL', name: 'Netherlands',     currency: 'EUR', phonePrefix: '+31',
    options: [m.card(), m.ideal()] }),
  BE: makeRegion({ code: 'BE', name: 'Belgium',         currency: 'EUR', phonePrefix: '+32',
    options: [m.card()] }),
  ES: makeRegion({ code: 'ES', name: 'Spain',           currency: 'EUR', phonePrefix: '+34',
    options: [m.card()] }),
  IT: makeRegion({ code: 'IT', name: 'Italy',           currency: 'EUR', phonePrefix: '+39',
    options: [m.card()] }),
  PT: makeRegion({ code: 'PT', name: 'Portugal',        currency: 'EUR', phonePrefix: '+351',
    options: [m.card()] }),
  CA: makeRegion({ code: 'CA', name: 'Canada',          currency: 'CAD', phonePrefix: '+1',
    options: [m.card()] }),
  AU: makeRegion({ code: 'AU', name: 'Australia',       currency: 'AUD', phonePrefix: '+61',
    options: [m.card()] }),
};

export const DEFAULT_REGION: RegionConfig = makeRegion({
  code: 'INT', name: 'International', currency: 'USD', phonePrefix: '+1',
  options: [m.card()],
});

export function detectRegion(): RegionConfig {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const code = TZ_TO_COUNTRY[tz];
    if (code && COUNTRY_CONFIGS[code]) return COUNTRY_CONFIGS[code];
  } catch {}
  return DEFAULT_REGION;
}

export const ALL_COUNTRIES: RegionConfig[] = [
  DEFAULT_REGION,
  ...Object.values(COUNTRY_CONFIGS).sort((a, b) => a.countryName.localeCompare(b.countryName)),
];
