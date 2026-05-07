/**
 * Eden output sanitizer.
 *
 * Greg's explicit ask: no em-dashes (—) or en-dashes (–) in user-facing
 * Eden output. The system prompt asks the model to avoid them, but LLMs
 * are unreliable on hard format rules, so we strip any survivors at the
 * edge before they reach the chat UI.
 *
 * Rules (in order — order matters because each pass rewrites the input):
 *   1. Em-dash with surrounding spaces → period + space (split sentence).
 *   2. Em-dash without surrounding spaces → hyphen (covers "co—op").
 *   3. En-dash between digits → hyphen (numeric ranges: 4–5 → 4-5).
 *   4. En-dash between word chars → " to " (date/word ranges).
 *   5. Any other surviving en-dash → hyphen (catch-all).
 *   6. Tidy double-periods that come from rule 1.
 *
 * Pure function so vitest can cover it without spinning up Deno.
 */

export function sanitizeDashes(text: string): string {
  if (!text) return text;

  let out = text;

  // 1) "low pH — a light application" → "low pH. A light application"
  //    Capitalise the first character of the new sentence so it reads as
  //    a real split, not a comma-spliced fragment.
  out = out.replace(/\s+—\s+([A-Za-z])/g, (_m, c: string) => '. ' + c.toUpperCase());
  // Same rule for any leftover em-dashes with spaces but no following letter.
  out = out.replace(/\s+—\s+/g, '. ');

  // 2) Surviving em-dashes (no surrounding spaces) → plain hyphen.
  out = out.replace(/—/g, '-');

  // 3) Numeric ranges: 4–5, 530–660, 75–80%
  out = out.replace(/(\d)\s*–\s*(\d)/g, '$1-$2');

  // 4) Word/date ranges: "May 1 – May 7", "Mon – Fri" → " to "
  out = out.replace(/(\w)\s+–\s+(\w)/g, '$1 to $2');

  // 5) Catch-all en-dash → hyphen.
  out = out.replace(/–/g, '-');

  // 6) Cleanup: collapse ".." and ". ." that come from rule 1 hitting
  //    inside parentheses or after an existing punctuation mark.
  out = out.replace(/\.\s+\./g, '.');
  out = out.replace(/\.\.+/g, '.');

  return out;
}

/**
 * Recursively sanitize all string fields in a plain JSON value.
 * Used for the <eden:structured> block (headline + next_steps[] + data[]).
 */
export function sanitizeStructured<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeDashes(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeStructured(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      next[k] = sanitizeStructured(v);
    }
    return next as unknown as T;
  }
  return value;
}
