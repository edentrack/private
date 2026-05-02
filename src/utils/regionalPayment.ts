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

// Fixed prices per currency — set once, never fluctuate
// Must match PricingSection.tsx and stripe-checkout/index.ts exactly
export const FIXED_PRICES: Record<string, Record<string, Record<string, number>>> = {
  USD: {
    monthly:   { pro: 12,  enterprise: 35,  industry: 89  },
    quarterly: { pro: 30,  enterprise: 87,  industry: 222 },
    yearly:    { pro: 108, enterprise: 300, industry: 800 },
  },
  XAF: {
    monthly:   { pro: 7500,  enterprise: 21000, industry: 53000  },
    quarterly: { pro: 18000, enterprise: 52000, industry: 132000 },
    yearly:    { pro: 65000, enterprise: 180000, industry: 480000 },
  },
  XOF: {
    monthly:   { pro: 7500,  enterprise: 21000, industry: 53000  },
    quarterly: { pro: 18000, enterprise: 52000, industry: 132000 },
    yearly:    { pro: 65000, enterprise: 180000, industry: 480000 },
  },
  NGN: {
    monthly:   { pro: 19000,  enterprise: 56000,  industry: 145000  },
    quarterly: { pro: 48000,  enterprise: 139000, industry: 355000  },
    yearly:    { pro: 173000, enterprise: 483000, industry: 1285000 },
  },
  GHS: {
    monthly:   { pro: 180,  enterprise: 549,  industry: 1445  },
    quarterly: { pro: 460,  enterprise: 1342, industry: 3440  },
    yearly:    { pro: 1642, enterprise: 4670, industry: 12360 },
  },
  KES: {
    monthly:   { pro: 1550, enterprise: 4700,  industry: 12200  },
    quarterly: { pro: 4000, enterprise: 11400, industry: 28900  },
    yearly:    { pro: 14000, enterprise: 39000, industry: 104000 },
  },
  ZAR: {
    monthly:   { pro: 220,  enterprise: 650,  industry: 1670  },
    quarterly: { pro: 560,  enterprise: 1616, industry: 4100  },
    yearly:    { pro: 1990, enterprise: 5610, industry: 14790 },
  },
  UGX: {
    monthly:   { pro: 44500,  enterprise: 133000,  industry: 356000   },
    quarterly: { pro: 110000, enterprise: 323000,  industry: 832000   },
    yearly:    { pro: 400000, enterprise: 1122000, industry: 3030000  },
  },
  TZS: {
    monthly:   { pro: 32500,  enterprise: 95700,  industry: 244900  },
    quarterly: { pro: 80000,  enterprise: 231000, industry: 588000  },
    yearly:    { pro: 285000, enterprise: 801000, industry: 2121000 },
  },
  RWF: {
    monthly:   { pro: 16300, enterprise: 49000,  industry: 129000  },
    quarterly: { pro: 40000, enterprise: 117000, industry: 300000  },
    yearly:    { pro: 145000, enterprise: 404000, industry: 1079000 },
  },
  EGP: {
    monthly:   { pro: 565,  enterprise: 1775, industry: 4560  },
    quarterly: { pro: 1440, enterprise: 4180, industry: 10660 },
    yearly:    { pro: 5180, enterprise: 14400, industry: 38400 },
  },
  MAD: {
    monthly:   { pro: 120,  enterprise: 378, industry: 979  },
    quarterly: { pro: 300,  enterprise: 870, industry: 2220 },
    yearly:    { pro: 1080, enterprise: 3000, industry: 8000 },
  },
  ZMW: {
    monthly:   { pro: 318,  enterprise: 1004, industry: 2670 },
    quarterly: { pro: 810,  enterprise: 2349, industry: 5994 },
    yearly:    { pro: 2916, enterprise: 8100, industry: 21598 },
  },
  EUR: {
    monthly:   { pro: 10.99, enterprise: 32.99, industry: 81.99  },
    quarterly: { pro: 27.99, enterprise: 79.99, industry: 204.99 },
    yearly:    { pro: 99.99, enterprise: 274.99, industry: 739.99 },
  },
  GBP: {
    monthly:   { pro: 9.99,  enterprise: 27.99, industry: 69.99  },
    quarterly: { pro: 24.99, enterprise: 69.99, industry: 174.99 },
    yearly:    { pro: 89.99, enterprise: 239.99, industry: 639.99 },
  },
  CAD: {
    monthly:   { pro: 15.99, enterprise: 47.99, industry: 119.99  },
    quarterly: { pro: 39.99, enterprise: 119.99, industry: 299.99 },
    yearly:    { pro: 144.99, enterprise: 409.99, industry: 1079.99 },
  },
  AUD: {
    monthly:   { pro: 18.99, enterprise: 54.99, industry: 139.99  },
    quarterly: { pro: 46.99, enterprise: 136.99, industry: 349.99 },
    yearly:    { pro: 169.99, enterprise: 479.99, industry: 1249.99 },
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
