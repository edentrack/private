export interface CountryInfo {
  name: string;
  currency: string;
  currencySymbol: string;
  currencyName: string;
}

export const COUNTRY_CURRENCY_MAP: Record<string, CountryInfo> = {
  'Cameroon': {
    name: 'Cameroon',
    currency: 'XAF',
    currencySymbol: 'XAF',
    currencyName: 'Central African CFA Franc'
  },
  'Nigeria': {
    name: 'Nigeria',
    currency: 'NGN',
    currencySymbol: '₦',
    currencyName: 'Nigerian Naira'
  },
  'Ghana': {
    name: 'Ghana',
    currency: 'GHS',
    currencySymbol: 'GH₵',
    currencyName: 'Ghanaian Cedi'
  },
  'Kenya': {
    name: 'Kenya',
    currency: 'KES',
    currencySymbol: 'KSh',
    currencyName: 'Kenyan Shilling'
  },
  'South Africa': {
    name: 'South Africa',
    currency: 'ZAR',
    currencySymbol: 'R',
    currencyName: 'South African Rand'
  },
  'Rwanda': {
    name: 'Rwanda',
    currency: 'RWF',
    currencySymbol: 'FRw',
    currencyName: 'Rwandan Franc'
  },
  'Uganda': {
    name: 'Uganda',
    currency: 'UGX',
    currencySymbol: 'USh',
    currencyName: 'Ugandan Shilling'
  },
  'Tanzania': {
    name: 'Tanzania',
    currency: 'TZS',
    currencySymbol: 'TSh',
    currencyName: 'Tanzanian Shilling'
  },
  'Ethiopia': {
    name: 'Ethiopia',
    currency: 'ETB',
    currencySymbol: 'Br',
    currencyName: 'Ethiopian Birr'
  },
  'Senegal': {
    name: 'Senegal',
    currency: 'XOF',
    currencySymbol: 'CFA',
    currencyName: 'West African CFA Franc'
  },
  'Ivory Coast': {
    name: 'Ivory Coast',
    currency: 'XOF',
    currencySymbol: 'CFA',
    currencyName: 'West African CFA Franc'
  },
  'Benin': {
    name: 'Benin',
    currency: 'XOF',
    currencySymbol: 'CFA',
    currencyName: 'West African CFA Franc'
  },
  'Togo': {
    name: 'Togo',
    currency: 'XOF',
    currencySymbol: 'CFA',
    currencyName: 'West African CFA Franc'
  },
  'United States': {
    name: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    currencyName: 'US Dollar'
  },
  'Canada': {
    name: 'Canada',
    currency: 'CAD',
    currencySymbol: 'CA$',
    currencyName: 'Canadian Dollar'
  },
  'United Kingdom': {
    name: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    currencyName: 'British Pound'
  },
  'European Union': {
    name: 'European Union',
    currency: 'EUR',
    currencySymbol: '€',
    currencyName: 'Euro'
  },
  'India': {
    name: 'India',
    currency: 'INR',
    currencySymbol: '₹',
    currencyName: 'Indian Rupee'
  },
  'Brazil': {
    name: 'Brazil',
    currency: 'BRL',
    currencySymbol: 'R$',
    currencyName: 'Brazilian Real'
  },
  'China': {
    name: 'China',
    currency: 'CNY',
    currencySymbol: '¥',
    currencyName: 'Chinese Yuan'
  },
  'Australia': {
    name: 'Australia',
    currency: 'AUD',
    currencySymbol: 'A$',
    currencyName: 'Australian Dollar'
  }
};

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_CURRENCY_MAP).sort();

export function getCurrencyForCountry(country: string): string {
  const countryInfo = COUNTRY_CURRENCY_MAP[country];
  return countryInfo?.currency || 'USD';
}

export function getCurrencySymbol(currencyCode: string): string {
  const country = Object.values(COUNTRY_CURRENCY_MAP).find(
    info => info.currency === currencyCode
  );
  return country?.currencySymbol || currencyCode;
}

export function formatCurrency(amount: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);

  if (currencyCode === 'XAF' || currencyCode === 'CFA' || currencyCode === 'XOF') {
    return `${Math.round(amount).toLocaleString()} ${symbol}`;
  }

  if (currencyCode === 'RWF' || currencyCode === 'UGX' || currencyCode === 'TZS') {
    return `${symbol} ${Math.round(amount).toLocaleString()}`;
  }

  try {
    return `${symbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  } catch {
    return `${amount.toLocaleString()} ${currencyCode}`;
  }
}

export function getCountryInfo(country: string): CountryInfo | null {
  return COUNTRY_CURRENCY_MAP[country] || null;
}
