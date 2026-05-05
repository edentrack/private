# Mobile UX Audit — Aquaculture pages

**Generated:** 2026-05-05 · **Phase B Step 27**

This is a static audit of the fish-specific pages from a real-mobile, 3G-budget perspective. Every "PASS" / "FAIL" / "REVIEW" is a literal check that should be re-done by a human on a real Android budget phone before declaring fish v1 shipped.

The Phase B Step 28 (final QA) gate cannot be cleared until every line below either passes or has a tracked follow-up.

## Methodology

For each page below, check:
1. **Initial JS payload** — does the page chunk exceed 200 KB gzip? (Use the build output to spot-check.)
2. **Tap targets** — are interactive elements ≥44 × 44 CSS px? (Check via dev-tools touch simulation.)
3. **Modal close behaviour** — does the X button always dismiss? Does swipe-down dismiss?
4. **Date pickers** — does mobile Safari render them natively? Are they keyboard-accessible?
5. **Forms** — does the user need horizontal scroll on a 360px-wide device?
6. **Charts** — do they render on touch and pinch-zoom? Are tooltips reachable on tap?
7. **Loading state** — does the page show a skeleton inside 100 ms? Or does it show a blank screen for >2s on 3G?
8. **Image loading** — are species images lazy-loaded? Are they appropriately sized?

## Pages to audit

### `/#/water-quality` (WaterQualityPage.tsx)

| Check | Status | Notes |
|---|---|---|
| Page chunk size | REVIEW | Verify in `dist/assets/` after build |
| Tap targets | PASS | Buttons use `px-4 py-2` ≥44px |
| Add-reading modal close | PASS | X button + Cancel button |
| Date picker | PASS | Native `<input type="date">` |
| Form scroll on 360px | REVIEW | Manual test required |
| Loading skeleton | FAIL | Currently shows text "Loading…" — replace with actual skeleton |
| Emergency banner | PASS | Added in Phase B Step 13 wiring |

### `/#/sampling` (SamplingEventsPage.tsx)

| Check | Status | Notes |
|---|---|---|
| Multiple-weight input | PASS | "+ Add 5 more" is the right pattern |
| ABW preview live update | PASS | Computes as you type |
| Validation messages | PASS | "Need at least 5 weights — currently 0" |
| Sample history list scroll | REVIEW | Test with 50+ samples |
| Date display matches dashboard widget | PASS | Both use local-date renderer |

### Dashboard `AquaCycleWidget`

| Check | Status | Notes |
|---|---|---|
| SGR / density / harvest pills (Step 9-12) | PASS | Wired in Phase B utilities PR |
| Pills wrap on 360px | REVIEW | Use `flex-wrap` already; verify visually |
| Phase milestones tap behaviour | PASS | Read-only, no tap target needed |

### `/#/harvest` (HarvestPage.tsx)

| Check | Status | Notes |
|---|---|---|
| Multiple harvest events table scroll | REVIEW | |
| Add harvest event form | REVIEW | |
| Auto-decrement of current_count | PASS (per audit-report) | |

### `/#/insights` (InsightsPage.tsx)

| Check | Status | Notes |
|---|---|---|
| Empty state CTA visible without scroll | PASS | Inline button added in audit polish |
| FCR sub-label species-aware | PASS | Uses `species.fcrUnit` |
| Sell/Keep card species-aware | PASS | Uses `species.preHarvestSignal` |

## Page-level performance budget targets

After full Phase B work, every aquaculture page should:
- First contentful paint < 2s on 3G (Slow 3G profile in Chrome DevTools)
- Total payload (HTML + JS + CSS) < 500 KB gzip
- Lighthouse Mobile Performance score ≥ 70

Current state (per latest build):
- `WeightTracking-*.js` 72 KB gzip 19 KB → likely OK
- `WaterQualityPage` shares chunks with poultry; check after splitting
- `pdf-*.js` 398 KB gzip 130 KB → only loaded on report generation, OK as lazy chunk
- `index-*.js` 459 KB gzip 142 KB → first load, **bordering on too big**

**Tactical follow-ups:**
- Lazy-load `recharts` (CartesianChart-*.js is 331 KB gzip 99 KB) for non-chart routes
- Audit `index-*.js` for dead imports (i18next loads all locales — should split)
- Compress species PNG/JPGs to WebP — likely 30-50% saving

## Definition of "shipped"

Step 27 is **not "done"** in this PR. This document is the worklist. Step 28
(final QA) requires:
1. A real Android budget phone to walk through each page on Chrome over throttled 3G
2. A profiling pass with the React DevTools profiler on each page
3. A Lighthouse CI run on each page
4. All FAIL entries above resolved, all REVIEW entries verified

Track follow-ups as separate PRs once the foundation Phase B work is in
place. The utility code shipped in this Phase B sprint is the prerequisite
for the QA-able UX.
