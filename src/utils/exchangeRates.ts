const CACHE_KEY = 'edentrack_fx_rates';
const CACHE_DATE_KEY = 'edentrack_fx_date';

const CURRENCIES = 'XAF,XOF,NGN,GHS,KES,ZAR,ETB,TZS,UGX,RWF,EUR,GBP,CAD,AUD,MAD,EGP';

// Fallback rates if API is unreachable (updated April 2026)
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, XAF: 605, XOF: 605, NGN: 1600, GHS: 15.5, KES: 130,
  ZAR: 18.5, ETB: 57, TZS: 2600, UGX: 3750, RWF: 1330,
  EUR: 0.92, GBP: 0.79, CAD: 1.37, AUD: 1.54, MAD: 10, EGP: 48,
};

export async function getExchangeRates(): Promise<Record<string, number>> {
  const today = new Date().toISOString().split('T')[0];
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
    if (cached && cachedDate === today) return JSON.parse(cached);
  } catch {}

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${CURRENCIES}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error('rate fetch failed');
    const data = await res.json();
    const rates: Record<string, number> = { USD: 1, ...data.rates };
    localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
    localStorage.setItem(CACHE_DATE_KEY, today);
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}

// Currencies with no decimal places (whole numbers only)
const NO_DECIMALS = new Set(['XAF', 'XOF', 'NGN', 'GHS', 'KES', 'ETB', 'TZS', 'UGX', 'RWF', 'EGP', 'MAD']);

// Prefix symbols
const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'AU$',
  NGN: '₦', GHS: 'GH₵', KES: 'KSh', ZAR: 'R',
  XAF: 'FCFA', XOF: 'CFA', ETB: 'ETB ', TZS: 'TZS ', UGX: 'USh', RWF: 'RWF ', MAD: 'MAD ', EGP: 'EGP ',
};

// Symbols that go after the amount
const SUFFIX_SYMBOLS = new Set(['FCFA', 'CFA', 'ETB ', 'TZS ', 'RWF ', 'MAD ', 'EGP ']);

export function toLocalPrice(usdAmount: number, currency: string, rate: number): number {
  const raw = usdAmount * rate;
  if (currency === 'USD') return Math.floor(usdAmount) + 0.99;

  if (NO_DECIMALS.has(currency)) {
    // Round to a .999 equivalent in whole numbers (e.g. 8999, 23999)
    const magnitude = raw > 50000 ? 10000 : raw > 10000 ? 1000 : raw > 1000 ? 100 : 10;
    return Math.ceil(raw / magnitude) * magnitude - 1;
  }
  return Math.floor(raw) + 0.99;
}

export function formatLocalPrice(usdAmount: number, currency: string, rate: number): string {
  const amount = toLocalPrice(usdAmount, currency, rate);
  const symbol = SYMBOLS[currency] || currency + ' ';
  const noDecimals = NO_DECIMALS.has(currency);

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  });

  return SUFFIX_SYMBOLS.has(symbol) ? `${formatted} ${symbol.trim()}` : `${symbol}${formatted}`;
}
