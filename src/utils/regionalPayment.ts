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
// Non-USD prices are rounded up to clean numbers; USD uses .99 format
export const FIXED_PRICES: Record<string, Record<string, Record<string, number>>> = {
  USD: {
    monthly:   { pro: 6.99,   enterprise: 14.99,  industry: 39.99 },
    quarterly: { pro: 14.99,  enterprise: 34.99,  industry: 99.99 },
    yearly:    { pro: 49.99,  enterprise: 114.99, industry: 329.99 },
  },
  XAF: {
    monthly:   { pro: 4500,   enterprise: 10000,  industry: 26000 },
    quarterly: { pro: 9000,   enterprise: 21000,  industry: 60000 },
    yearly:    { pro: 30000,  enterprise: 69000,  industry: 199000 },
  },
  XOF: {
    monthly:   { pro: 4500,   enterprise: 10000,  industry: 26000 },
    quarterly: { pro: 9000,   enterprise: 21000,  industry: 60000 },
    yearly:    { pro: 30000,  enterprise: 69000,  industry: 199000 },
  },
  NGN: {
    monthly:   { pro: 11000,  enterprise: 24000,  industry: 65000 },
    quarterly: { pro: 24000,  enterprise: 56000,  industry: 160000 },
    yearly:    { pro: 80000,  enterprise: 185000, industry: 530000 },
  },
  GHS: {
    monthly:   { pro: 105,    enterprise: 235,    industry: 649 },
    quarterly: { pro: 230,    enterprise: 540,    industry: 1550 },
    yearly:    { pro: 760,    enterprise: 1790,   industry: 5100 },
  },
  KES: {
    monthly:   { pro: 900,    enterprise: 2000,   industry: 5500 },
    quarterly: { pro: 2000,   enterprise: 4600,   industry: 13000 },
    yearly:    { pro: 6500,   enterprise: 15000,  industry: 43000 },
  },
  ZAR: {
    monthly:   { pro: 129,    enterprise: 279,    industry: 749 },
    quarterly: { pro: 280,    enterprise: 650,    industry: 1850 },
    yearly:    { pro: 920,    enterprise: 2150,   industry: 6100 },
  },
  UGX: {
    monthly:   { pro: 26000,  enterprise: 57000,  industry: 160000 },
    quarterly: { pro: 55000,  enterprise: 130000, industry: 375000 },
    yearly:    { pro: 185000, enterprise: 430000, industry: 1250000 },
  },
  TZS: {
    monthly:   { pro: 19000,  enterprise: 41000,  industry: 110000 },
    quarterly: { pro: 40000,  enterprise: 93000,  industry: 265000 },
    yearly:    { pro: 132000, enterprise: 307000, industry: 875000 },
  },
  RWF: {
    monthly:   { pro: 9500,   enterprise: 21000,  industry: 58000 },
    quarterly: { pro: 20000,  enterprise: 47000,  industry: 135000 },
    yearly:    { pro: 67000,  enterprise: 155000, industry: 445000 },
  },
  EGP: {
    monthly:   { pro: 330,    enterprise: 760,    industry: 2050 },
    quarterly: { pro: 720,    enterprise: 1680,   industry: 4800 },
    yearly:    { pro: 2400,   enterprise: 5520,   industry: 15840 },
  },
  MAD: {
    monthly:   { pro: 70,     enterprise: 162,    industry: 440 },
    quarterly: { pro: 150,    enterprise: 350,    industry: 1000 },
    yearly:    { pro: 500,    enterprise: 1150,   industry: 3300 },
  },
  ZMW: {
    monthly:   { pro: 185,    enterprise: 430,    industry: 1200 },
    quarterly: { pro: 405,    enterprise: 945,    industry: 2700 },
    yearly:    { pro: 1350,   enterprise: 3105,   industry: 8910 },
  },
  EUR: {
    monthly:   { pro: 6.49,   enterprise: 13.99,  industry: 36.99 },
    quarterly: { pro: 13.99,  enterprise: 31.99,  industry: 91.99 },
    yearly:    { pro: 45.99,  enterprise: 104.99, industry: 299.99 },
  },
  GBP: {
    monthly:   { pro: 5.99,   enterprise: 11.99,  industry: 34.99 },
    quarterly: { pro: 11.99,  enterprise: 27.99,  industry: 79.99 },
    yearly:    { pro: 39.99,  enterprise: 91.99,  industry: 259.99 },
  },
  CAD: {
    monthly:   { pro: 9.49,   enterprise: 20.99,  industry: 54.99 },
    quarterly: { pro: 20.99,  enterprise: 47.99,  industry: 137.99 },
    yearly:    { pro: 68.99,  enterprise: 158.99, industry: 454.99 },
  },
  AUD: {
    monthly:   { pro: 10.49,  enterprise: 23.99,  industry: 62.99 },
    quarterly: { pro: 22.99,  enterprise: 53.99,  industry: 153.99 },
    yearly:    { pro: 75.99,  enterprise: 177.99, industry: 508.99 },
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
