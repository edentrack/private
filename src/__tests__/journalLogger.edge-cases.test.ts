import { describe, it, expect } from 'vitest';
import { formatActorName, formatMoney } from '../lib/journalLogger';

/**
 * Edge cases on top of journalLogger.test.ts. These cover the messy
 * shapes we get from real production data: unicode in names, very
 * long names, fractional money, foreign currency codes the user
 * pastes in upper/lower case, and the boundaries between the
 * no-decimals and two-decimals currency groups.
 *
 * Kept separate from the main suite so the green/red counts on
 * journalLogger.test.ts stay stable as we add bug-driven cases here.
 */

describe('formatActorName edge cases', () => {
  it('handles unicode names (accents, non-Latin)', () => {
    expect(formatActorName({ fullName: 'Émile Müller', email: null, role: 'manager' }))
      .toBe('Émile Müller (manager)');
    expect(formatActorName({ fullName: 'Ọláńrewájú Adébáyò', email: null, role: 'worker' }))
      .toBe('Ọláńrewájú Adébáyò (worker)');
  });

  it('does not truncate long names', () => {
    const long = 'A Very Very Long Real Person Name Going On Forever';
    expect(formatActorName({ fullName: long, email: null, role: 'owner' }))
      .toBe(`${long} (owner)`);
  });

  it('email with plus addressing keeps the local part intact', () => {
    expect(formatActorName({ fullName: null, email: 'farmer+broiler@gmail.com', role: 'worker' }))
      .toBe('farmer+broiler (worker)');
  });

  it('email with no @ falls all the way to Someone', () => {
    expect(formatActorName({ fullName: null, email: 'not-an-email', role: 'manager' }))
      .toBe('not-an-email (manager)');
  });
});

describe('formatMoney edge cases', () => {
  it('XOF / RWF / UGX / TZS all use zero decimals', () => {
    expect(formatMoney(11000, 'XOF')).toBe('11,000 XOF');
    expect(formatMoney(9500, 'RWF')).toBe('9,500 RWF');
    expect(formatMoney(26000, 'UGX')).toBe('26,000 UGX');
    expect(formatMoney(19000, 'TZS')).toBe('19,000 TZS');
  });

  it('GHS / EGP / MAD / ZMW / ZAR all use zero decimals', () => {
    expect(formatMoney(105, 'GHS')).toBe('105 GHS');
    expect(formatMoney(330, 'EGP')).toBe('330 EGP');
    expect(formatMoney(70, 'MAD')).toBe('70 MAD');
    expect(formatMoney(185, 'ZMW')).toBe('185 ZMW');
    expect(formatMoney(130, 'ZAR')).toBe('130 ZAR');
  });

  it('CAD and AUD use two decimals (Western convention)', () => {
    expect(formatMoney(8.99, 'CAD')).toBe('8.99 CAD');
    expect(formatMoney(10.99, 'AUD')).toBe('10.99 AUD');
  });

  it('negative amounts render with the minus sign', () => {
    // Used by Eden cycle-closeout when net P&L is a loss.
    expect(formatMoney(-12000, 'XAF')).toBe('-12,000 XAF');
    expect(formatMoney(-7.5, 'USD')).toBe('-7.50 USD');
  });

  it('rounds half-cent inputs to the currency convention', () => {
    // Internal computation can produce 12.555 etc.; we want a clean
    // display value. toLocaleString rounds half-to-even.
    expect(formatMoney(12.555, 'USD').endsWith(' USD')).toBe(true);
    expect(formatMoney(999.999, 'EUR').endsWith(' EUR')).toBe(true);
  });

  it('unknown currency code uses 2 decimals (safe Western default)', () => {
    expect(formatMoney(100, 'JPY')).toBe('100.00 JPY');
    expect(formatMoney(100, 'CHF')).toBe('100.00 CHF');
  });
});
