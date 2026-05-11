import { describe, it, expect } from 'vitest';
import { formatActorName, formatMoney } from '../lib/journalLogger';

/**
 * Pure-function tests for the journal logger helpers. The async DB
 * paths (logActivity, logNote) need a Supabase mock, which would
 * couple this suite to the client setup; we keep those covered by
 * the live smoke test on prod instead. These two helpers are the
 * formatting core that the activity-row body strings depend on, so
 * regressions here would make the whole timeline look weird.
 */

describe('formatActorName', () => {
  it('uses full_name when present, with role chip in parens', () => {
    expect(formatActorName({ fullName: 'Three Samples', email: null, role: 'manager' }))
      .toBe('Three Samples (manager)');
  });

  it('falls back to the email local part when full_name is missing', () => {
    expect(formatActorName({ fullName: null, email: 'jane.doe@example.com', role: 'worker' }))
      .toBe('jane.doe (worker)');
  });

  it('falls back to "Someone" when both fields are missing', () => {
    expect(formatActorName({ fullName: null, email: null, role: 'owner' }))
      .toBe('Someone (owner)');
  });

  it('trims whitespace from full_name without breaking', () => {
    expect(formatActorName({ fullName: '  Padded Name  ', email: null, role: 'owner' }))
      .toBe('Padded Name (owner)');
  });

  it('renders empty-string full_name as the email fallback', () => {
    expect(formatActorName({ fullName: '', email: 'alice@example.com', role: 'manager' }))
      .toBe('alice (manager)');
  });
});

describe('formatMoney', () => {
  it('uses zero decimals for African currencies', () => {
    expect(formatMoney(50000, 'XAF')).toBe('50,000 XAF');
    expect(formatMoney(11000, 'NGN')).toBe('11,000 NGN');
    expect(formatMoney(900, 'KES')).toBe('900 KES');
  });

  it('uses two decimals for USD / EUR / GBP', () => {
    expect(formatMoney(7, 'USD')).toBe('7.00 USD');
    expect(formatMoney(6.99, 'EUR')).toBe('6.99 EUR');
    expect(formatMoney(14.99, 'GBP')).toBe('14.99 GBP');
  });

  it('handles thousand separators correctly', () => {
    expect(formatMoney(1234567, 'XAF')).toBe('1,234,567 XAF');
    expect(formatMoney(1234.5, 'USD')).toBe('1,234.50 USD');
  });

  it('is case-insensitive on the currency code', () => {
    expect(formatMoney(100, 'xaf')).toBe('100 xaf');
    expect(formatMoney(100, 'usd')).toBe('100.00 usd');
  });

  it('handles zero gracefully', () => {
    expect(formatMoney(0, 'XAF')).toBe('0 XAF');
    expect(formatMoney(0, 'USD')).toBe('0.00 USD');
  });
});
