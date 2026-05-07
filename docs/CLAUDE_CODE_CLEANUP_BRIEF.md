# Pre-launch cleanup brief — em-dashes, dashes, residual UI polish

**Owner:** Claude Code
**Working directory:** `/Users/greatadigwe/Documents/edentrack`
**Branch:** `cleanup-em-dashes-and-residual-ui`
**Source of truth for findings:** Cowork verification on bundle `index-3j7Gi78Z.js`, May 8 2026.

---

## ABSOLUTE PRIORITY — Greg's explicit ask

> "Eden AI has a lot of dashes and I don't like responding with dashes. I want a clean response."

This is the headline fix in this brief. Eden's LLM output uses em-dashes (`—`) and en-dashes (`–`) constantly. **Verified live on prod**, single Eden response contained 5+ em-dashes:

> *"(upper limit for catfish — thermal stress zone)"*
> *"(below the 6.5 minimum — acidic stress)"*
> *"Latest Water Quality — Pond 1"*
> *"The afternoon crashed hard — this pattern is typical"*
> *"low pH — a light application will help buffer the acidity"*

Plus en-dashes in numeric ranges: *"4–5% of biomass"*, *"530–660g of feed per day"*, *"30–50% partial water exchange"*.

The fix is at three layers and **all three need to ship**.

---

## Layer 1: Eden system prompt — hard rule

**File:** `supabase/functions/ai-chat/index.ts`

Add this section near the top of `SYSTEM_PROMPT` AND `ONBOARDING_SYSTEM_PROMPT`, right after the opening identity block:

```
## ⚠️ ABSOLUTE WRITING RULE — NEVER VIOLATE ⚠️

NEVER use em-dashes (—) or en-dashes (–) in your responses. Not in prose. Not in headings. Not in numeric ranges.

Use these substitutions instead:
- Em-dash for a parenthetical → use a period or comma. WRONG: "low pH — a light application helps". RIGHT: "low pH. A light application helps." OR "low pH; a light application helps."
- Em-dash for emphasis → use a period or short sentence. WRONG: "afternoon crashed hard — this pattern is typical". RIGHT: "afternoon crashed hard. This pattern is typical."
- En-dash for a numeric range → use "to" or a hyphen. WRONG: "4–5% of biomass" or "530–660g". RIGHT: "4 to 5% of biomass" or "4-5% of biomass" with a regular hyphen.
- En-dash for date ranges → use "to". WRONG: "May 1–7". RIGHT: "May 1 to 7".

If you find yourself reaching for an em-dash, the sentence probably wants to be split into two. Split it.

This rule overrides ALL other style preferences. The user has explicitly asked for no dashes. Honor it.
```

Place it before the existing personality / response-style guidance so it primes every response.

**Also remove em-dashes from the prompt text itself.** A grep of `supabase/functions/ai-chat/index.ts` shows 230 em-dashes — most are in code comments (fine, keep) but the ones in *prompt text strings* should be replaced with commas or periods because the model copies its own input style.

---

## Layer 2: Output sanitizer — belt and suspenders

**File:** `supabase/functions/ai-chat/index.ts`

LLMs are unreliable on hard format rules. The system prompt will catch ~80%; we need a sanitizer for the other 20%.

After Eden's response is generated and before the response is returned to the client, run a sanitization pass:

```typescript
function sanitizeDashes(text: string): string {
  return text
    // Em-dash with surrounding spaces → period + space (sentence split)
    .replace(/\s+—\s+/g, '. ')
    // Em-dash in numeric ranges or no spaces → hyphen
    .replace(/—/g, '-')
    // En-dash in numeric ranges → hyphen
    .replace(/(\d)–(\d)/g, '$1-$2')
    // En-dash in word ranges → " to "
    .replace(/(\w)\s*–\s*(\w)/g, '$1 to $2')
    // Stray en-dashes anywhere else → hyphen
    .replace(/–/g, '-')
    // Clean up double-period from sentence-split
    .replace(/\.\s+\./g, '.')
    .replace(/\.\.\s/g, '. ');
}
```

**Apply at TWO call sites:**
1. The text that streams back to the chat UI (`message` field of the response payload)
2. The text inside any `<eden:structured>` JSON block before parsing — sanitize the `headline`, every `next_steps[]` entry, and every `data[]` entry

**Add a unit test:**

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeDashes } from './sanitize';

describe('sanitizeDashes', () => {
  it('replaces em-dash with surrounding spaces with period', () => {
    expect(sanitizeDashes('low pH — a light application helps'))
      .toBe('low pH. A light application helps');
  });
  it('replaces en-dash in numeric range with hyphen', () => {
    expect(sanitizeDashes('4–5% of biomass')).toBe('4-5% of biomass');
    expect(sanitizeDashes('530–660g')).toBe('530-660g');
  });
  it('replaces en-dash in word range with " to "', () => {
    expect(sanitizeDashes('May 1 – May 7')).toBe('May 1 to May 7');
  });
  it('handles multiple dashes in one string', () => {
    const input = 'afternoon crashed hard — DO 2.5 — pH 5.8 — 30–50% water exchange';
    const out = sanitizeDashes(input);
    expect(out).not.toContain('—');
    expect(out).not.toContain('–');
  });
  it('preserves regular hyphens in compound words', () => {
    expect(sanitizeDashes('point-of-lay')).toBe('point-of-lay');
    expect(sanitizeDashes('feed-water ratio')).toBe('feed-water ratio');
  });
});
```

**This is the critical layer.** Even if Greg never asks for the prompt rule, the sanitizer alone removes 100% of dashes from Eden's user-facing output regardless of what the LLM produces.

---

## Layer 3: Static UI strings — locale files + marketing copy

These are user-facing strings hard-coded in the codebase. The total count is small (~30 strings), but every one is visible.

### Files to edit:

**`src/locales/en.json`** — 6 user-facing em-dashes:

| Line | Current | Suggested |
|---|---|---|
| 367 | "No flocks here yet. Your manager will add flocks when ready — check back soon." | "No flocks here yet. Your manager will add flocks when ready. Check back soon." |
| 1590 | "All internal calculations use grams—this setting converts bags to kg for display." | "All internal calculations use grams. This setting converts bags to kg for display." |
| 1707 | "No vaccinations scheduled yet. Your manager will add vaccination records — check back regularly." | "No vaccinations scheduled yet. Your manager will add vaccination records. Check back regularly." |
| 1834 | "Talk to Eden — about 5 minutes" | "Talk to Eden, about 5 minutes" |
| 1835 | "Skip — go to form" | "Skip to form" |
| 1837 | "Wrapping up — heading to your dashboard…" | "Wrapping up. Heading to your dashboard…" |
| 1839 | "Hey! I'm Eden. I'll set up your farm in a few quick questions. First — what's your farm called?" | "Hey! I'm Eden. I'll set up your farm in a few quick questions. First, what's your farm called?" |

**`src/locales/fr.json`** — same 6 strings translated. Replace em-dashes with appropriate French punctuation (`,` or `.` — French formal style prefers `,`).

### Marketing / landing copy

**Files:** `src/components/landing/*.tsx` and `src/components/auth/SignUpScreen.tsx` + `src/components/auth/LoginScreen.tsx`

Run this grep:
```
grep -n "—" src/components/landing/*.tsx src/components/auth/*.tsx
```

For each match in JSX text content (not code comments), replace the em-dash with a period or comma. Common patterns:

- `"... — work even without internet."` → `"... and work even without internet."` or split into two sentences
- `"... — like a professional"` → `". Like a professional."` or remove the dash entirely

**Code comments containing em-dashes are fine. Leave them.** The user never sees `// Auth screens — kept eager`.

### How to know what's a code comment vs user-facing

User-facing strings are in:
- `*.json` files in `src/locales/`
- JSX text inside components (between tags like `<p>...</p>`, `<button>...</button>`, `<h1>...</h1>`)
- String literals passed to `t('...')` or `i18n.t('...')`
- `placeholder` and `aria-label` attributes
- `alert()`, `confirm()`, toast messages

Code comments are in:
- `// ...` and `/* ... */` blocks
- JSDoc blocks `/** ... */`

A safe heuristic: **if the string starts with `//`, `/*`, or `*` (continuation of a JSDoc), don't touch it.**

---

## Acceptance criteria for the dash cleanup PR

After this PR ships:

1. Ask Eden any question on prod — verify response has zero em-dashes (`—`) and zero en-dashes (`–`).
2. Ask Eden specifically: *"Why is my mortality higher this week?"* — verify the analytical response (which historically uses lots of em-dashes) is dash-free.
3. Open the Onboarding chat — verify Eden's first-message text has no em-dashes.
4. Open Tasks page on a farm with no flocks — verify the "Your manager will add flocks when ready" message has no em-dashes.
5. Run the new `sanitizeDashes` unit tests — all pass.
6. Spot-check French language (Settings → Prefs → French) — same checks pass.

---

## Section 2: Other findings from the verification click-through

These are NOT in scope for the dash cleanup PR. List them for Greg to triage as separate work.

### Finding A: Existing pond data has stale species

**Observed:** Riverside Tilapia Farm has Pond 1 showing "Catfish" species in the production cycle widget and dashboard ("Catfish · 450 fish"). The farm name is "Tilapia Farm".

**Cause:** The species selector on Edit Pond was added in PR #40, but existing pond rows in the database still have `pond_type='catfish'` from before the fix.

**Fix:** Either
- (a) Open the pond, edit, change species to Tilapia, save. (One-off cleanup for this account.)
- (b) Migration that backfills `pond_type` from the parent farm's species hint or the pond's `species_hint` field if any. (Systemic fix.)

Option (a) is fine for now since this is a test account. If real farmers report similar after launch, do (b) then.

### Finding B: Lay-rate tooltip — verify it renders

**Status:** Implemented in PR #39 per Claude Code's report. **Not yet visually verified on prod.**

**To verify:** Login as a poultry farm user (test.edentrack@gmail.com Sunrise Layers Farm). Open Insights or the Dashboard KPI block. Find the lay-rate KPI. Hover/tap it. Confirm the tooltip reads something like "*Across N hens past point-of-lay, over D collection days*" with real N and D values.

**If missing:** confirm the tooltip is mounted in `CoreKPISection.tsx` and `formatLayRateExplainer` is called.

### Finding C: Eden structured response cards — verify they render

**Status:** PR #28 shipped the renderer; the system prompt was updated in commit 3c2e57f. **Not yet visually verified on prod.**

**To verify:** Login as a farm with at least 2-3 weeks of data (test.edentrack@gmail.com or a populated tenant). Ask Eden: *"Why is my mortality higher this week?"* OR *"Compare my flocks' performance this month."*

Expected: response renders as **three visually distinct cards**:
- 🎯 KEY FINDING (single-sentence headline)
- ✓ NEXT STEPS (numbered list)
- 📊 DATA REFERENCED (bullet list of farm numbers)

**If still rendering as plain prose:** debug `EdenStructuredResponse.tsx` parsing of `<eden:structured>` blocks. Verify the system prompt actually contains the "STRUCTURED RESPONSE CARDS" section by reading `supabase/functions/ai-chat/index.ts` and grepping for `eden:structured`.

### Finding D: Pond species pill on dashboard widget

**Observed:** The "Production Cycle" widget on the dashboard shows the species pill (top-right corner). On Riverside Tilapia Farm, it correctly shows "Catfish" (matching the pond's stale species data — confirms Finding A is the root cause). Once Finding A is fixed, this should display "Tilapia" automatically.

### Finding E: "Good afternoon, Test"

**Observed:** Dashboard greeting says "Good afternoon, Test". Acceptable behavior post-BUG-009 fix (the email-prefix-fallback is supposed to drop stray local-parts), but "Test" is the user's actual stored full name on this account, not a fallback. So this is correct. **No action needed.**

### Finding F: At-cap upgrade flow (Thread 3 verification — pending)

**Not yet verified on prod.** Recommend test:

Login as test2 currently at 3/3 farms cap. Go to Eden. Ask: *"I want to add a goat farm"* or *"Can I add another fish farm?"*. Eden should mention the cap (3/3) and offer either upgrade or remove-an-unused-farm options. Eden should **NOT** say *"go create a new farm"*.

If Eden still recommends creating a new farm, the plan-awareness context isn't being passed correctly into the system prompt. Verify `farmContext` builder includes `plan_tier`, `current_farm_count`, `max_farms_for_tier`.

### Finding G: Rabbit onboarding cold-start (Thread 4 verification — pending)

**Not yet verified on prod.** Recommend test:

1. Sign up with a fresh email (`test4.edentrack@gmail.com` or new alias).
2. At signup, pick **Rabbits**.
3. Pick "Chat with Eden" path.
4. Tell Eden the farm name + you have 1 doe, 1 buck, recent kindling with 5 kits + 1 stillborn.
5. After Eden completes onboarding, navigate to Settings → Registry.
6. Verify both parents AND the kindling event AND the stillborn loss persisted.

This verifies BUG-033 fix end-to-end (the dependency-ordered writes from PR #42).

If only some records persist, the dependency-ordering logic in `OnboardingChat.tsx` action executor isn't correctly waiting for the parent insert to return an id before firing the child action.

---

## Stop conditions

- TS budget gate fires above 180 → fix before shipping
- Critical-path errors above 0 → fix before shipping
- Any test in the existing 131-test suite fails → revert and re-attempt
- Sanitizer unit tests don't all pass → fix before shipping
- Eden's response after the fix STILL contains em-dashes when probed with *"explain why my mortality is up"* → the sanitizer has a regex hole; debug

---

## Definition of done

- All em-dashes (`—`) and en-dashes (`–`) removed from Eden's user-facing output. Verified by typing 3 different analytical questions and inspecting responses.
- Static UI strings in en.json and fr.json have no user-facing em-dashes.
- Marketing copy in landing/auth pages has no em-dashes (code comments are fine).
- New `sanitizeDashes` unit tests pass.
- Bundle deployed. Edge function `ai-chat` redeployed.
- The 3 verification scenarios in Section 2 (B, C, F, G) tested on prod and reported back to Greg with screenshots or pass/fail status.

After this PR merges and verifications pass, EdenTrack is meaningfully cleaner-feeling AND the residual launch-readiness checks are closed.

---

## Estimated time

- Layer 1 (system prompt): 30 min
- Layer 2 (sanitizer + tests): 2 hours
- Layer 3 (static strings): 1 hour
- Verifications (Findings B, C, F, G): 30 min combined

**Total: ~4 hours of focused work.** Single PR, single deploy.
