export interface RegionConfig {
  countryCode: string;
  countryName: string;
  currency: string;
  processor: 'campay' | 'paystack' | 'stripe' | 'flutterwave';
  processorLabel: string;
  paymentMethods: string[];
  phonePrefix: string;
  needsPhone: boolean;
}

// Fixed prices per currency — set once, never fluctuate
// Non-USD prices are rounded up to clean numbers; USD uses .99 format
export const FIXED_PRICES: Record<string, Record<string, Record<string, number>>> = {
  USD: {
    quarterly: { pro: 14.99, enterprise: 34.99, industry: 99.99 },
    yearly:    { pro: 49.99, enterprise: 114.99, industry: 329.99 },
  },
  XAF: {
    quarterly: { pro: 9000,   enterprise: 21000,  industry: 60000 },
    yearly:    { pro: 30000,  enterprise: 69000,  industry: 199000 },
  },
  XOF: {
    quarterly: { pro: 9000,   enterprise: 21000,  industry: 60000 },
    yearly:    { pro: 30000,  enterprise: 69000,  industry: 199000 },
  },
  NGN: {
    quarterly: { pro: 24000,  enterprise: 56000,  industry: 160000 },
    yearly:    { pro: 80000,  enterprise: 185000, industry: 530000 },
  },
  GHS: {
    quarterly: { pro: 230,    enterprise: 540,    industry: 1550 },
    yearly:    { pro: 760,    enterprise: 1790,   industry: 5100 },
  },
  KES: {
    quarterly: { pro: 2000,   enterprise: 4600,   industry: 13000 },
    yearly:    { pro: 6500,   enterprise: 15000,  industry: 43000 },
  },
  ZAR: {
    quarterly: { pro: 280,    enterprise: 650,    industry: 1850 },
    yearly:    { pro: 920,    enterprise: 2150,   industry: 6100 },
  },
  EUR: {
    quarterly: { pro: 13.99,  enterprise: 31.99,  industry: 91.99 },
    yearly:    { pro: 45.99,  enterprise: 104.99, industry: 299.99 },
  },
  GBP: {
    quarterly: { pro: 11.99,  enterprise: 27.99,  industry: 79.99 },
    yearly:    { pro: 39.99,  enterprise: 91.99,  industry: 259.99 },
  },
  CAD: {
    quarterly: { pro: 20.99,  enterprise: 47.99,  industry: 137.99 },
    yearly:    { pro: 68.99,  enterprise: 158.99, industry: 454.99 },
  },
  AUD: {
    quarterly: { pro: 22.99,  enterprise: 53.99,  industry: 153.99 },
    yearly:    { pro: 75.99,  enterprise: 177.99, industry: 508.99 },
  },
};

// Currency formatting
const CURRENCY_FORMAT: Record<string, { prefix: string; suffix: string; decimals: number }> = {
  USD: { prefix: '$',     suffix: '',     decimals: 2 },
  XAF: { prefix: '',     suffix: ' FCFA',decimals: 0 },
  XOF: { prefix: '',     suffix: ' CFA', decimals: 0 },
  NGN: { prefix: '₦',    suffix: '',     decimals: 0 },
  GHS: { prefix: 'GH₵',  suffix: '',     decimals: 0 },
  KES: { prefix: 'KSh ', suffix: '',     decimals: 0 },
  ZAR: { prefix: 'R',    suffix: '',     decimals: 0 },
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

export function getPrice(plan: string, billing: 'quarterly' | 'yearly', currency: string): number {
  const table = FIXED_PRICES[currency] || FIXED_PRICES.USD;
  return table[billing]?.[plan] ?? FIXED_PRICES.USD[billing][plan];
}

export function getPriceCurrency(region: RegionConfig): string {
  return FIXED_PRICES[region.currency] ? region.currency : 'USD';
}

// ── Region configs ──────────────────────────────────────────────────────

const TZ_TO_COUNTRY: Record<string, string> = {
  'Africa/Douala': 'CM', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH',
  'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Abidjan': 'CI',
  'Africa/Dakar': 'SN', 'Africa/Addis_Ababa': 'ET', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kampala': 'UG', 'Africa/Kigali': 'RW', 'Africa/Kinshasa': 'CD',
  'Africa/Bangui': 'CF', 'Africa/Libreville': 'GA', 'Africa/Ndjamena': 'TD',
  'Africa/Brazzaville': 'CG', 'Africa/Bamako': 'ML', 'Africa/Ouagadougou': 'BF',
  'Africa/Niamey': 'NE', 'Africa/Lome': 'TG', 'Africa/Cotonou': 'BJ',
  'Africa/Conakry': 'GN', 'Africa/Freetown': 'SL', 'Africa/Monrovia': 'LR',
  'Africa/Casablanca': 'MA', 'Africa/Cairo': 'EG', 'Africa/Tunis': 'TN',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Los_Angeles': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
};

export const COUNTRY_CONFIGS: Record<string, RegionConfig> = {
  CM: { countryCode: 'CM', countryName: 'Cameroon',      currency: 'XAF', processor: 'campay',     processorLabel: 'MTN MoMo / Orange Money', paymentMethods: ['MTN Mobile Money', 'Orange Money'],       phonePrefix: '+237', needsPhone: true  },
  NG: { countryCode: 'NG', countryName: 'Nigeria',       currency: 'NGN', processor: 'paystack',   processorLabel: 'Card / Bank Transfer',    paymentMethods: ['Card', 'Bank Transfer', 'USSD'],           phonePrefix: '+234', needsPhone: false },
  GH: { countryCode: 'GH', countryName: 'Ghana',         currency: 'GHS', processor: 'paystack',   processorLabel: 'Card / Mobile Money',     paymentMethods: ['Card', 'MTN MoMo', 'Vodafone Cash'],       phonePrefix: '+233', needsPhone: false },
  KE: { countryCode: 'KE', countryName: 'Kenya',         currency: 'KES', processor: 'paystack',   processorLabel: 'Card / M-Pesa',           paymentMethods: ['Card', 'M-Pesa'],                          phonePrefix: '+254', needsPhone: false },
  ZA: { countryCode: 'ZA', countryName: 'South Africa',  currency: 'ZAR', processor: 'paystack',   processorLabel: 'Card',                    paymentMethods: ['Card', 'EFT'],                             phonePrefix: '+27',  needsPhone: false },
  CI: { countryCode: 'CI', countryName: "Côte d'Ivoire", currency: 'XOF', processor: 'flutterwave',processorLabel: 'MTN MoMo / Orange',       paymentMethods: ['Mobile Money'],                            phonePrefix: '+225', needsPhone: false },
  SN: { countryCode: 'SN', countryName: 'Senegal',       currency: 'XOF', processor: 'flutterwave',processorLabel: 'Wave / Orange Money',     paymentMethods: ['Mobile Money'],                            phonePrefix: '+221', needsPhone: false },
  GB: { countryCode: 'GB', countryName: 'United Kingdom',currency: 'GBP', processor: 'stripe',     processorLabel: 'Card',                    paymentMethods: ['Card', 'Apple Pay', 'Google Pay'],         phonePrefix: '+44',  needsPhone: false },
  FR: { countryCode: 'FR', countryName: 'France',        currency: 'EUR', processor: 'stripe',     processorLabel: 'Card',                    paymentMethods: ['Card'],                                    phonePrefix: '+33',  needsPhone: false },
  DE: { countryCode: 'DE', countryName: 'Germany',       currency: 'EUR', processor: 'stripe',     processorLabel: 'Card',                    paymentMethods: ['Card', 'SEPA'],                            phonePrefix: '+49',  needsPhone: false },
  CA: { countryCode: 'CA', countryName: 'Canada',        currency: 'CAD', processor: 'stripe',     processorLabel: 'Card',                    paymentMethods: ['Card'],                                    phonePrefix: '+1',   needsPhone: false },
  AU: { countryCode: 'AU', countryName: 'Australia',     currency: 'AUD', processor: 'stripe',     processorLabel: 'Card',                    paymentMethods: ['Card'],                                    phonePrefix: '+61',  needsPhone: false },
  US: { countryCode: 'US', countryName: 'United States', currency: 'USD', processor: 'stripe',     processorLabel: 'Card',                    paymentMethods: ['Card', 'Apple Pay', 'Google Pay'],         phonePrefix: '+1',   needsPhone: false },
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
