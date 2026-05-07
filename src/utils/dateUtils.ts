/**
 * Date helpers that respect the user's local timezone.
 *
 * Why this exists: `new Date('2026-05-07')` is parsed as UTC midnight by
 * the JavaScript engine. If the user is in a negative-UTC timezone (the
 * Americas), `toLocaleDateString()` then renders that as the *previous*
 * day — which is exactly the bug a Nigeria-based user surfaced about
 * expenses appearing one day earlier than expected.
 *
 * All YYYY-MM-DD date columns coming from Postgres should be parsed
 * through `parseLocalDate` so the displayed day matches the stored day.
 */

/** Parse a YYYY-MM-DD or full ISO string as a local-time Date. */
export function parseLocalDate(s: string | null | undefined): Date {
  if (!s) return new Date(NaN);
  const parts = String(s).split(/[-T]/);
  if (parts.length >= 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    return new Date(y, m, d);
  }
  return new Date(s);
}

/** Format a YYYY-MM-DD column for display in the user's locale. */
export function formatLocalDate(
  s: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  locale: string = 'en-US',
): string {
  const d = parseLocalDate(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, options);
}

/**
 * Today as YYYY-MM-DD in the user's local timezone.
 *
 * Canonical helper. Use this for *every* "default today" form value that
 * gets persisted to a DATE column. Direct `new Date().toISOString()` calls
 * use UTC, which rolls forward by ~5 hours of the day for UTC+1 farms in
 * West Africa — log an expense at 21:00 WAT and it saves as tomorrow.
 */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @deprecated alias for {@link todayLocal} — keep until callers migrated. */
export const todayLocalISO = todayLocal;
