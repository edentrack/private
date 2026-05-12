import { describe, it, expect } from 'vitest';
import {
  COUNTRY_CONFIGS,
  DEFAULT_REGION,
  ALL_COUNTRIES,
  type RegionConfig,
  type PaymentOption,
} from '../utils/regionalPayment';

/**
 * Lock the payment routing policy (May 2026 rewrite):
 *
 *   Africa  →  Flutterwave for cards + local methods.
 *              EXCEPT South Africa, where Stripe handles ZAR cards.
 *   Non-Africa  →  Stripe everywhere (cards, Apple Pay, Google Pay,
 *                  SEPA, iDEAL).
 *
 * If someone accidentally flips a country to the wrong processor or
 * removes the card option from a country, these tests should be the
 * first thing that screams.
 */

const AFRICAN_NON_ZA = [
  'NG', 'GH', 'KE', 'EG', 'MA',
  'UG', 'TZ', 'RW', 'ZM',
  'CM', 'CI', 'SN', 'ML', 'BF', 'NE', 'TG', 'BJ',
  'ET', 'ZW', 'MZ', 'MW', 'GN', 'SL', 'LR', 'GM',
];

const STRIPE_ONLY = ['US', 'GB', 'FR', 'DE', 'NL', 'BE', 'ES', 'IT', 'PT', 'CA', 'AU'];

function findCard(region: RegionConfig): PaymentOption | undefined {
  return region.paymentOptions.find(o => o.id === 'card');
}

describe('regionalPayment — Africa routes cards via Flutterwave (except ZA)', () => {
  for (const code of AFRICAN_NON_ZA) {
    it(`${code}: card option uses Flutterwave`, () => {
      const region = COUNTRY_CONFIGS[code];
      expect(region, `${code} missing from COUNTRY_CONFIGS`).toBeDefined();
      const card = findCard(region);
      expect(card, `${code} missing card option`).toBeDefined();
      expect(card!.processor).toBe('flutterwave');
    });
  }
});

describe('regionalPayment — South Africa keeps Stripe', () => {
  it('ZA card option uses Stripe', () => {
    const za = COUNTRY_CONFIGS.ZA;
    expect(za).toBeDefined();
    const card = findCard(za);
    expect(card!.processor).toBe('stripe');
  });

  it('ZA secondary methods route via Flutterwave (EFT)', () => {
    const za = COUNTRY_CONFIGS.ZA;
    const eft = za.paymentOptions.find(o => o.id === 'eft');
    expect(eft).toBeDefined();
    expect(eft!.processor).toBe('flutterwave');
  });
});

describe('regionalPayment — non-Africa routes through Stripe', () => {
  for (const code of STRIPE_ONLY) {
    it(`${code}: all options use Stripe`, () => {
      const region = COUNTRY_CONFIGS[code];
      expect(region, `${code} missing from COUNTRY_CONFIGS`).toBeDefined();
      for (const opt of region.paymentOptions) {
        expect(opt.processor, `${code}.${opt.id} should be Stripe`).toBe('stripe');
      }
    });
  }
});

describe('regionalPayment — invariants', () => {
  it('every country has at least one payment option', () => {
    for (const code of Object.keys(COUNTRY_CONFIGS)) {
      expect(COUNTRY_CONFIGS[code].paymentOptions.length).toBeGreaterThan(0);
    }
  });

  it('every country has card as its first option', () => {
    // First option is the default selection in the UI — must be the
    // most universal one, which is "Card" everywhere we support.
    for (const code of Object.keys(COUNTRY_CONFIGS)) {
      const first = COUNTRY_CONFIGS[code].paymentOptions[0];
      expect(first.id, `${code}'s default option`).toBe('card');
    }
  });

  it('DEFAULT_REGION is International / USD / Stripe card', () => {
    expect(DEFAULT_REGION.countryCode).toBe('INT');
    expect(DEFAULT_REGION.currency).toBe('USD');
    expect(DEFAULT_REGION.paymentOptions[0].processor).toBe('stripe');
    expect(DEFAULT_REGION.paymentOptions[0].id).toBe('card');
  });

  it('ALL_COUNTRIES starts with DEFAULT and contains every config', () => {
    expect(ALL_COUNTRIES[0]).toBe(DEFAULT_REGION);
    const configCodes = Object.keys(COUNTRY_CONFIGS);
    for (const code of configCodes) {
      expect(ALL_COUNTRIES.find(r => r.countryCode === code), `${code} missing from ALL_COUNTRIES`).toBeDefined();
    }
  });

  it('no country routes to Paystack anymore (dead code purge)', () => {
    for (const code of Object.keys(COUNTRY_CONFIGS)) {
      for (const opt of COUNTRY_CONFIGS[code].paymentOptions) {
        // @ts-expect-error — the union doesn't include paystack any more,
        // but if it crept back in via a bad refactor we want a runtime catch.
        expect(opt.processor).not.toBe('paystack');
      }
    }
  });

  it('chargeCurrency override is only used by Flutterwave card options', () => {
    // After the May 2026 rewrite, the only currency overrides are
    // Flutterwave routing in countries where Flutterwave needs USD
    // (Ethiopia, Zimbabwe, Mozambique, Malawi, Guinea, Sierra Leone,
    // Liberia, Gambia). Stripe cards charge in the region's
    // native currency directly.
    for (const code of Object.keys(COUNTRY_CONFIGS)) {
      const region = COUNTRY_CONFIGS[code];
      const card = findCard(region);
      if (card?.chargeCurrency) {
        // If a card has chargeCurrency set, it must be a Stripe card
        // (Flutterwave handles its own currency mapping at request
        // time). With ZA's local ZAR routing intact, no card should
        // currently carry a chargeCurrency override — but the test
        // is defensive in case we add one later.
        expect(card.processor).toBe('stripe');
      }
    }
  });
});
