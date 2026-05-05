/**
 * Tiny pluralization helpers — kill the "1 weeks old" / "1 weeks until next phase"
 * grammar bugs surfaced in the 2026-05-05 audit.
 *
 * Keep this dependency-free; it gets imported from many components.
 */

/**
 * Returns the singular or plural form of `noun` based on `n`.
 *
 *   weekWord(1) → "week"
 *   weekWord(0) → "weeks"
 *   weekWord(2) → "weeks"
 *
 * For nouns whose plural is just `noun + "s"`. For irregulars, callers
 * should pass `pluralForm` explicitly.
 */
export function pluralize(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : pluralForm ?? `${singular}s`;
}

/**
 * Combine count + correctly-pluralized noun.
 *
 *   counted(1, 'week')  → "1 week"
 *   counted(3, 'fish', 'fish') → "3 fish"
 */
export function counted(n: number, singular: string, pluralForm?: string): string {
  return `${n.toLocaleString()} ${pluralize(n, singular, pluralForm)}`;
}
