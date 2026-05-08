import { describe, it, expect } from 'vitest';
import { parseInlineDate } from '../utils/parseInlineDate';

/**
 * Coverage target: the May 8 2026 client-side date-fallback that fixes
 * BUG #5 ("Eden ignored arrived 3 months ago") at the executor level.
 *
 * The conversational onboarding flow has the LLM produce CREATE_FLOCK
 * actions with `arrival_date` set to YYYY-MM-DD when the user gave the
 * date inline. In practice Eden complies maybe 80% of the time. The
 * client-side parseInlineDate runs as a deterministic safety net so a
 * non-compliant LLM response can't silently default the flock to today.
 *
 * Anchor every relative-date test to a fixed `today` so the assertions
 * don't drift over time.
 */

describe('parseInlineDate', () => {
  // 2026-05-08 — the day Greg's audit caught the bug.
  const today = new Date('2026-05-08T12:00:00Z');

  it('returns null for empty / no-match input', () => {
    expect(parseInlineDate('', today)).toBeNull();
    expect(parseInlineDate('Pen 1, 100 layers', today)).toBeNull();
    expect(parseInlineDate('all good', today)).toBeNull();
  });

  it('parses "today"', () => {
    expect(parseInlineDate('arrived today', today)).toBe('2026-05-08');
  });

  it('parses "yesterday"', () => {
    expect(parseInlineDate('we got them yesterday', today)).toBe('2026-05-07');
  });

  it('parses "last week" / "last month"', () => {
    expect(parseInlineDate('arrived last week', today)).toBe('2026-05-01');
    expect(parseInlineDate('they came last month', today)).toBe('2026-04-08');
  });

  it('parses "X days ago"', () => {
    expect(parseInlineDate('5 days ago', today)).toBe('2026-05-03');
    expect(parseInlineDate('arrived 14 days ago', today)).toBe('2026-04-24');
  });

  it('parses "X weeks ago"', () => {
    expect(parseInlineDate('2 weeks ago', today)).toBe('2026-04-24');
    expect(parseInlineDate('arrived 6 weeks ago', today)).toBe('2026-03-27');
  });

  it('parses "X months ago" — Greg\'s exact regression case', () => {
    // Greg's prompt was "Pen 1, 100 layers, arrived 3 months ago" on
    // 2026-05-08. 30-day month approximation → 2026-02-07.
    expect(parseInlineDate('Pen 1, 100 layers, arrived 3 months ago', today))
      .toBe('2026-02-07');
    expect(parseInlineDate('arrived 6 months ago', today)).toBe('2025-11-09');
  });

  it('parses "X years ago"', () => {
    expect(parseInlineDate('1 year ago', today)).toBe('2025-05-08');
  });

  it('parses "X ... back" as an alias for "X ... ago"', () => {
    expect(parseInlineDate('3 months back', today)).toBe('2026-02-07');
    expect(parseInlineDate('2 weeks back', today)).toBe('2026-04-24');
  });

  it('parses ISO dates verbatim', () => {
    expect(parseInlineDate('on 2026-02-07 they arrived', today)).toBe('2026-02-07');
  });

  it('parses month-day phrases (current year if past, last year if future)', () => {
    // March 1 is before May 8 → current year.
    expect(parseInlineDate('arrived March 1', today)).toBe('2026-03-01');
    // December 15 is after May 8 → fall back to last year.
    expect(parseInlineDate('arrived December 15', today)).toBe('2025-12-15');
    // Full month name works too.
    expect(parseInlineDate('we got them January 22', today)).toBe('2026-01-22');
  });

  it('is case-insensitive', () => {
    expect(parseInlineDate('ARRIVED 3 MONTHS AGO', today)).toBe('2026-02-07');
    expect(parseInlineDate('Last Week', today)).toBe('2026-05-01');
  });

  it('takes the first match when multiple phrases are present', () => {
    // "yesterday" comes after the relative phrase but the regex order
    // gives X-days-ago first. Greg is unlikely to write both, but the
    // tie-break should be stable.
    const out = parseInlineDate('5 days ago we picked them up yesterday', today);
    expect(out).toBe('2026-05-03');
  });

  it('ignores numbers that aren\'t paired with a unit', () => {
    expect(parseInlineDate('100 layers', today)).toBeNull();
    expect(parseInlineDate('Pen 1', today)).toBeNull();
  });
});
