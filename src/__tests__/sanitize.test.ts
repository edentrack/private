import { describe, it, expect } from 'vitest';
import {
  sanitizeDashes,
  sanitizeStructured,
} from '../../supabase/functions/_shared/sanitize';

/**
 * Greg's explicit ask: NO em-dashes (—) or en-dashes (–) in Eden's
 * user-facing output. The sanitizer runs after the LLM and is the
 * second of three layers (system-prompt rule + sanitizer + manual UI
 * cleanup). The sanitizer is the only one that's deterministic, so
 * these tests are the contract.
 */

describe('sanitizeDashes', () => {
  it('replaces em-dash with surrounding spaces with a period + capitalised next letter', () => {
    expect(sanitizeDashes('low pH — a light application helps')).toBe(
      'low pH. A light application helps',
    );
  });

  it('replaces en-dash in numeric range with hyphen', () => {
    expect(sanitizeDashes('4–5% of biomass')).toBe('4-5% of biomass');
    expect(sanitizeDashes('530–660g')).toBe('530-660g');
    expect(sanitizeDashes('75–80%')).toBe('75-80%');
  });

  it('replaces en-dash in word range with " to "', () => {
    expect(sanitizeDashes('May 1 – May 7')).toBe('May 1 to May 7');
    expect(sanitizeDashes('Mon – Fri')).toBe('Mon to Fri');
  });

  it('handles multiple dashes in one string', () => {
    const input = 'afternoon crashed hard — DO 2.5 — pH 5.8 — 30–50% water exchange';
    const out = sanitizeDashes(input);
    expect(out).not.toContain('—');
    expect(out).not.toContain('–');
    // The 30–50% range collapses to 30-50% (numeric range rule).
    expect(out).toContain('30-50%');
  });

  it('preserves regular hyphens in compound words', () => {
    expect(sanitizeDashes('point-of-lay')).toBe('point-of-lay');
    expect(sanitizeDashes('feed-water ratio')).toBe('feed-water ratio');
    expect(sanitizeDashes('co-op partner')).toBe('co-op partner');
  });

  it('handles em-dash without spaces (rare but real)', () => {
    expect(sanitizeDashes('co—op')).toBe('co-op');
  });

  it('reproduces the exact strings Greg quoted from prod', () => {
    const examples: Array<[string, string]> = [
      [
        '(upper limit for catfish — thermal stress zone)',
        '(upper limit for catfish. Thermal stress zone)',
      ],
      [
        '(below the 6.5 minimum — acidic stress)',
        '(below the 6.5 minimum. Acidic stress)',
      ],
      [
        'Latest Water Quality — Pond 1',
        'Latest Water Quality. Pond 1',
      ],
      [
        'The afternoon crashed hard — this pattern is typical',
        'The afternoon crashed hard. This pattern is typical',
      ],
      [
        'low pH — a light application will help buffer the acidity',
        'low pH. A light application will help buffer the acidity',
      ],
      ['4–5% of biomass', '4-5% of biomass'],
      ['530–660g of feed per day', '530-660g of feed per day'],
      ['30–50% partial water exchange', '30-50% partial water exchange'],
    ];
    for (const [input, expected] of examples) {
      expect(sanitizeDashes(input)).toBe(expected);
    }
  });

  it('is idempotent — running it twice produces the same output', () => {
    const input = 'low pH — a light application helps. 4–5% of biomass.';
    const once = sanitizeDashes(input);
    const twice = sanitizeDashes(once);
    expect(twice).toBe(once);
  });

  it('handles empty / null-ish input safely', () => {
    expect(sanitizeDashes('')).toBe('');
    // @ts-expect-error - intentionally pass undefined to verify safety
    expect(sanitizeDashes(undefined)).toBe(undefined);
    // @ts-expect-error - intentionally pass null to verify safety
    expect(sanitizeDashes(null)).toBe(null);
  });

  it('does not split on dashes inside markdown bullet lists', () => {
    // Markdown bullets use "- " which uses a regular hyphen, not an
    // em/en dash. Verify we leave that alone.
    const input = '- First item\n- Second item';
    expect(sanitizeDashes(input)).toBe(input);
  });
});

describe('sanitizeStructured', () => {
  it('walks an <eden:structured> block and sanitises every string field', () => {
    const block = {
      headline: 'Mortality jumped — likely ammonia stress',
      next_steps: [
        'Test ammonia today (target < 0.5 mg/L) — use a strip kit',
        'Aerate 4–6 hours per day',
      ],
      data: ['12 deaths in Pond 2 (May 1–5)'],
    };
    const cleaned = sanitizeStructured(block);
    expect(JSON.stringify(cleaned)).not.toContain('—');
    expect(JSON.stringify(cleaned)).not.toContain('–');
    expect(cleaned.headline).toBe('Mortality jumped. Likely ammonia stress');
    expect(cleaned.next_steps[1]).toBe('Aerate 4-6 hours per day');
    expect(cleaned.data[0]).toBe('12 deaths in Pond 2 (May 1-5)');
  });

  it('passes non-string values through unchanged', () => {
    expect(sanitizeStructured(42)).toBe(42);
    expect(sanitizeStructured(true)).toBe(true);
    expect(sanitizeStructured(null)).toBe(null);
  });
});
