/**
 * Parse a natural-language relative date out of a free-text English
 * message. Returns YYYY-MM-DD or null if no date phrase matched.
 *
 * Used by the conversational onboarding flow as a fallback when Eden's
 * CREATE_FLOCK action lacks `arrival_date` despite the system-prompt
 * INLINE DATE RULE. Greg's audit (May 8 2026) caught Eden ignoring
 * "arrived 3 months ago" twice in a row even with the rule deployed —
 * trusting the LLM to compute dates isn't reliable, so we parse
 * client-side.
 *
 * Supported phrases (case-insensitive):
 *   - "today"
 *   - "yesterday"
 *   - "last week" / "last month"
 *   - "X days ago" / "X weeks ago" / "X months ago" / "X years ago"
 *   - "X days back" / "X weeks back" / etc
 *   - "May 1" / "March 12" / "december 3" (current year, falls back to
 *     last year if the result lands in the future)
 *   - ISO date "2025-11-07"
 *
 * "X months ago" treats a month as 30 days (approximate). Good enough
 * for "is this flock 1 week or 12 weeks old" — exact would need a
 * calendar library and the use case doesn't justify the bytes.
 */
export function parseInlineDate(text: string, today: Date = new Date()): string | null {
  if (!text) return null;
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const lower = text.toLowerCase();

  // "X days/weeks/months/years ago" or "X ... back"
  const ago = lower.match(/(\d+)\s*(day|week|month|year)s?\s*(?:ago|back)\b/);
  if (ago) {
    const n = parseInt(ago[1], 10);
    const d = new Date(today);
    if (ago[2] === 'day') d.setDate(d.getDate() - n);
    else if (ago[2] === 'week') d.setDate(d.getDate() - n * 7);
    else if (ago[2] === 'month') d.setDate(d.getDate() - n * 30);
    else if (ago[2] === 'year') d.setDate(d.getDate() - n * 365);
    return isoDate(d);
  }
  if (/\blast\s+week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return isoDate(d);
  }
  if (/\blast\s+month\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  }
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return isoDate(d);
  }
  if (/\btoday\b/.test(lower)) return isoDate(today);

  // ISO date like "2025-11-07"
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  // "May 1", "March 12", etc.
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const monthDay = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/,
  );
  if (monthDay) {
    const m = monthMap[monthDay[1].slice(0, 3)];
    const day = parseInt(monthDay[2], 10);
    if (m !== undefined && day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), m, day);
      if (d > today) d.setFullYear(d.getFullYear() - 1);
      return isoDate(d);
    }
  }
  return null;
}
