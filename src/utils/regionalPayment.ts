export interface RegionConfig {
  countryCode: string;
  countryName: string;
  currency: string;
  processor: 'paystack' | 'stripe' | 'flutterwave';
  processorLabel: string;
  paymentMethods: string[];
  phonePrefix: string;
  needsPhone: boolean;
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

export const COUNTRY_CONFIGS: Record<string, RegionConfig> = {
  // ── Flutterwave — Africa (local currencies) ─────────────────────────────
  NG: { countryCode: 'NG', countryName: 'Nigeria',         currency: 'NGN', processor: 'flutterwave', processorLabel: 'Card / Bank Transfer / USSD',  paymentMethods: ['Card', 'Bank Transfer', 'USSD', 'Mobile Money'], phonePrefix: '+234', needsPhone: false },
  GH: { countryCode: 'GH', countryName: 'Ghana',           currency: 'GHS', processor: 'flutterwave', processorLabel: 'Card / Mobile Money',           paymentMethods: ['Card', 'MTN MoMo', 'Vodafone Cash'],             phonePrefix: '+233', needsPhone: false },
  KE: { countryCode: 'KE', countryName: 'Kenya',           currency: 'KES', processor: 'flutterwave', processorLabel: 'Card / M-Pesa',                 paymentMethods: ['Card', 'M-Pesa'],                                phonePrefix: '+254', needsPhone: false },
  ZA: { countryCode: 'ZA', countryName: 'South Africa',    currency: 'ZAR', processor: 'flutterwave', processorLabel: 'Card / EFT',                    paymentMethods: ['Card', 'EFT'],                                   phonePrefix: '+27',  needsPhone: false },
  UG: { countryCode: 'UG', countryName: 'Uganda',          currency: 'UGX', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['MTN MoMo', 'Airtel Money'],                      phonePrefix: '+256', needsPhone: false },
  TZ: { countryCode: 'TZ', countryName: 'Tanzania',        currency: 'TZS', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['M-Pesa', 'Tigo Pesa', 'Airtel Money'],           phonePrefix: '+255', needsPhone: false },
  RW: { countryCode: 'RW', countryName: 'Rwanda',          currency: 'RWF', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['MTN MoMo', 'Airtel Money'],                      phonePrefix: '+250', needsPhone: false },
  ZM: { countryCode: 'ZM', countryName: 'Zambia',          currency: 'ZMW', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['MTN MoMo', 'Airtel Money'],                      phonePrefix: '+260', needsPhone: false },
  EG: { countryCode: 'EG', countryName: 'Egypt',           currency: 'EGP', processor: 'flutterwave', processorLabel: 'Card / Mobile Wallet',          paymentMethods: ['Card', 'Vodafone Cash', 'Fawry'],                phonePrefix: '+20',  needsPhone: false },
  MA: { countryCode: 'MA', countryName: 'Morocco',         currency: 'MAD', processor: 'flutterwave', processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+212', needsPhone: false },
  CM: { countryCode: 'CM', countryName: 'Cameroon',        currency: 'XAF', processor: 'flutterwave', processorLabel: 'MTN MoMo / Orange Money',       paymentMethods: ['MTN Mobile Money', 'Orange Money'],              phonePrefix: '+237', needsPhone: false },
  CI: { countryCode: 'CI', countryName: "Côte d'Ivoire",   currency: 'XOF', processor: 'flutterwave', processorLabel: 'MTN MoMo / Orange',             paymentMethods: ['MTN MoMo', 'Orange Money', 'Wave'],              phonePrefix: '+225', needsPhone: false },
  SN: { countryCode: 'SN', countryName: 'Senegal',         currency: 'XOF', processor: 'flutterwave', processorLabel: 'Wave / Orange Money',           paymentMethods: ['Wave', 'Orange Money', 'Free Money'],            phonePrefix: '+221', needsPhone: false },
  ML: { countryCode: 'ML', countryName: 'Mali',            currency: 'XOF', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['Orange Money', 'Moov Money'],                    phonePrefix: '+223', needsPhone: false },
  BF: { countryCode: 'BF', countryName: 'Burkina Faso',    currency: 'XOF', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['Orange Money', 'Moov Money'],                    phonePrefix: '+226', needsPhone: false },
  NE: { countryCode: 'NE', countryName: 'Niger',           currency: 'XOF', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['Airtel Money', 'Orange Money'],                  phonePrefix: '+227', needsPhone: false },
  TG: { countryCode: 'TG', countryName: 'Togo',            currency: 'XOF', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['T-Money', 'Flooz'],                              phonePrefix: '+228', needsPhone: false },
  BJ: { countryCode: 'BJ', countryName: 'Benin',           currency: 'XOF', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['MTN MoMo', 'Moov Money'],                        phonePrefix: '+229', needsPhone: false },
  // ── Flutterwave — Africa (USD billing) ──────────────────────────────────
  ET: { countryCode: 'ET', countryName: 'Ethiopia',        currency: 'USD', processor: 'flutterwave', processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+251', needsPhone: false },
  ZW: { countryCode: 'ZW', countryName: 'Zimbabwe',        currency: 'USD', processor: 'flutterwave', processorLabel: 'Card / EcoCash',                paymentMethods: ['Card', 'EcoCash'],                               phonePrefix: '+263', needsPhone: false },
  MZ: { countryCode: 'MZ', countryName: 'Mozambique',      currency: 'USD', processor: 'flutterwave', processorLabel: 'Card',                          paymentMethods: ['Card', 'M-Pesa'],                                phonePrefix: '+258', needsPhone: false },
  MW: { countryCode: 'MW', countryName: 'Malawi',          currency: 'USD', processor: 'flutterwave', processorLabel: 'Card',                          paymentMethods: ['Card', 'Airtel Money'],                          phonePrefix: '+265', needsPhone: false },
  GN: { countryCode: 'GN', countryName: 'Guinea',          currency: 'USD', processor: 'flutterwave', processorLabel: 'Mobile Money',                  paymentMethods: ['Orange Money', 'MTN MoMo'],                      phonePrefix: '+224', needsPhone: false },
  SL: { countryCode: 'SL', countryName: 'Sierra Leone',    currency: 'USD', processor: 'flutterwave', processorLabel: 'Card',                          paymentMethods: ['Card', 'Orange Money'],                          phonePrefix: '+232', needsPhone: false },
  LR: { countryCode: 'LR', countryName: 'Liberia',         currency: 'USD', processor: 'flutterwave', processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+231', needsPhone: false },
  GM: { countryCode: 'GM', countryName: 'Gambia',          currency: 'USD', processor: 'flutterwave', processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+220', needsPhone: false },
  // ── Stripe — US, UK, Europe, Oceania ────────────────────────────────────
  US: { countryCode: 'US', countryName: 'United States',   currency: 'USD', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card', 'Apple Pay', 'Google Pay'],               phonePrefix: '+1',   needsPhone: false },
  GB: { countryCode: 'GB', countryName: 'United Kingdom',  currency: 'GBP', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card', 'Apple Pay', 'Google Pay'],               phonePrefix: '+44',  needsPhone: false },
  FR: { countryCode: 'FR', countryName: 'France',          currency: 'EUR', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+33',  needsPhone: false },
  DE: { countryCode: 'DE', countryName: 'Germany',         currency: 'EUR', processor: 'stripe',      processorLabel: 'Card / SEPA',                   paymentMethods: ['Card', 'SEPA'],                                  phonePrefix: '+49',  needsPhone: false },
  NL: { countryCode: 'NL', countryName: 'Netherlands',     currency: 'EUR', processor: 'stripe',      processorLabel: 'Card / iDEAL',                  paymentMethods: ['Card', 'iDEAL'],                                 phonePrefix: '+31',  needsPhone: false },
  BE: { countryCode: 'BE', countryName: 'Belgium',         currency: 'EUR', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+32',  needsPhone: false },
  ES: { countryCode: 'ES', countryName: 'Spain',           currency: 'EUR', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+34',  needsPhone: false },
  IT: { countryCode: 'IT', countryName: 'Italy',           currency: 'EUR', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+39',  needsPhone: false },
  PT: { countryCode: 'PT', countryName: 'Portugal',        currency: 'EUR', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+351', needsPhone: false },
  CA: { countryCode: 'CA', countryName: 'Canada',          currency: 'CAD', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+1',   needsPhone: false },
  AU: { countryCode: 'AU', countryName: 'Australia',       currency: 'AUD', processor: 'stripe',      processorLabel: 'Card',                          paymentMethods: ['Card'],                                          phonePrefix: '+61',  needsPhone: false },
};

export const DEFAULT_REGION: RegionConfig = {
  countryCode: 'INT', countryName: 'International', currency: 'USD',
  processor: 'stripe', processorLabel: 'Card (Visa / Mastercard)',
  paymentMethods: ['Card'], phonePrefix: '+1', needsPhone: false,
};

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
