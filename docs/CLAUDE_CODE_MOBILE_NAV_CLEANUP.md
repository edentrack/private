# Mobile navigation cleanup + Reports timeout fix

**Owner:** Claude Code
**Working dir:** `/Users/greatadigwe/Documents/edentrack`
**Branch:** `mobile-nav-cleanup-reports-fix`
**Source of evidence:** Greg's real-device screenshots from iPhone, May 8 2026

---

## What Greg saw on his actual phone

Three screenshots showing:
- The Reports page with "Markdown report downloaded ✓" toast at bottom
- The hamburger menu open showing **14 items in a flat scrollable list** (Insights, Egg Records, Mortalities, Pond Planner, Inventory, Vaccinations, Expenses, Sales, Credit Score, Weight, Shifts, Team, Cooperatives, Reports, Settings)
- Plus 4 top-nav items (Dashboard, Flocks, Tasks, Eden AI) = **18 destinations total**

Greg's verbatim feedback:
> "the mobile has too many tabs for one to read through. some dont even work. i want to strip out cooperatives, the reports dont work for longer term it gave me seven days but is still loading for one month 5 mins later. group the mobile pages too as you did in the web version too"

## Four discrete tasks in this brief

1. **Group the mobile More menu** into named sections (matches web version)
2. **Remove Cooperatives** from navigation entirely
3. **Fix the Reports timeout** at 1-month+ ranges
4. **Audit every nav item** to find the "some don't even work" ones and fix them

---

## Task 1 — Group the mobile More menu

The current flat list of 14 items is unscannable. Group them with section headers, matching the conceptual grouping the web version already has.

**Recommended grouping (5 sections):**

```
PRODUCTION
  Egg Records       (poultry only — hide on aquaculture/rabbits farms)
  Mortalities
  Weight
  Vaccinations      (poultry only — hide on aquaculture/rabbits farms)

MONEY
  Expenses
  Sales
  Credit Score

OPERATIONS
  Inventory
  Pond Planner      (aquaculture only — hide on poultry/rabbits)
  Shifts

INSIGHTS
  Insights
  Reports

ACCOUNT
  Team
  Settings
```

That collapses 14 unstructured items into 5 sections of 2-4 items each. Each section gets a small uppercase section header (`text-xs uppercase tracking-wide text-gray-400 px-3 pt-3 pb-1 font-semibold`) above the items.

**Species-aware hiding:**
- Egg Records and Vaccinations are poultry-only — already hidden on non-poultry farms? If not, gate by `farmSpecies.id === 'poultry'`.
- Pond Planner is aquaculture-only — gate by `farmSpecies.id === 'aquaculture'`.
- This further reduces the menu length on fish/rabbit farms.

**File:** `src/components/dashboard/DashboardLayout.tsx` (where the More menu is rendered) and any mobile-specific menu component.

**Acceptance:** Open the hamburger menu on a 390px viewport. The list shows section headers and grouped items. The visual hierarchy makes scanning fast. Sections have consistent padding. On a fish farm, Egg Records and Vaccinations are absent. On a poultry farm, Pond Planner is absent.

---

## Task 2 — Remove Cooperatives entirely

Greg said: *"i want to strip out cooperatives"*

**Default interpretation: remove from navigation only, keep the routes/code available** in case super admin or future feature work wants them. We can fully delete the code later if Greg confirms.

**What to remove:**
- The "Cooperatives" entry in the More menu (mobile + desktop)
- Any prominent CTAs to /cooperatives or /cooperative-dashboard from elsewhere in the app
- Any onboarding hints mentioning cooperatives

**What to leave alone:**
- The route handlers for `/cooperatives` and `/cooperative-dashboard` (still respond if you navigate directly)
- The `cooperatives` database table and migrations
- The Supabase RLS policies
- The `src/components/cooperatives/` directory

**Reason for the soft-remove:** Cooperatives was real work (PR #16). If Greg's interpretation is "I don't see the value but maybe later," we keep the foundation. If he confirms "delete it forever," we do a separate cleanup PR to remove the code.

**Add a comment** at the top of the cooperatives components explaining: `// Cooperatives nav entry removed May 2026 per Greg's request. Routes still respond at /cooperatives if accessed directly. Delete the directory and migrations if this stays out of nav for >3 months.`

**Files:**
- `src/components/dashboard/DashboardLayout.tsx` — remove menu entry
- `src/App.tsx` — leave routes intact
- Any "Get started with cooperatives" CTA in dashboard widgets — remove

**Acceptance:** "Cooperatives" no longer appears in the More menu on mobile or desktop. Direct navigation to `/cooperatives` still loads the page (for super admin or future use). No broken links.

---

## Task 3 — Fix Reports timeout at 1-month+ ranges

This is the highest-priority bug in the brief because it's *not* a mobile-only issue — it's a real backend problem visible on every platform.

**Symptom:** 7-day report generates in seconds. 30-day report still loading after 5 minutes. Likely also broken at 90-day and year-to-date.

**Likely causes** (in order of probability):

1. **Supabase Edge Function timeout** — default is 60s. If the report builder fetches all rows then processes in JS, a month of data hits the wall.
2. **Inefficient query pattern** — N+1 queries (e.g., loading flocks, then for each flock loading mortality, then sales, then expenses, etc., one round-trip per flock per data type).
3. **Unscoped fetches** — pulling all sales/expenses/mortality without `farm_id` filter or without date range filter applied at SQL level (filtering in JS instead).
4. **Memory blow-up** — building a giant JSON object in memory for hundreds of rows.

**Investigation steps:**

1. **Find the report builder.** Likely in `src/utils/reportGenerator.ts` and a corresponding Supabase edge function (maybe `supabase/functions/farm-report-pdf` or similar). Read both.
2. **Check for N+1 patterns.** Look for `.forEach(async ...)` or `for (const flock of flocks) { await ... }` patterns that fan out into many round-trips.
3. **Check date filtering.** Every Supabase query that fetches event data (sales, expenses, mortality, eggs, water_quality, sampling, harvests, etc.) must include `.gte('date_field', startDate).lte('date_field', endDate)` AT THE QUERY LEVEL. If the code fetches ALL rows then filters in JS, that's the bug.
4. **Check the edge function timeout setting.** If the function is correctly configured for `verify_jwt = false` for a webhook, also confirm there's no `timeout` override less than 60s. Supabase edge functions can run up to 60s but it might be set lower.
5. **Profile with logs.** Add `console.time('queries')` / `console.timeEnd('queries')` markers around each major data fetch to see which one is slow. The Supabase function logs will surface it.

**Fixes (depending on root cause):**

- **If N+1 pattern**: rewrite as a single query per data type with `IN (...)` filter on flock IDs, OR a Supabase RPC that does the aggregation in SQL.
- **If unscoped fetches**: add `.gte` / `.lte` filters at the query level. Date range comes from the Reports UI's start/end fields.
- **If memory blow-up**: stream the report instead of building it in memory. For PDF, generate page-by-page. For CSV, append rows as they arrive.
- **If timeout limit**: bump the function's timeout to 60s if not already there. If 60s isn't enough at 1-year ranges, the report is genuinely too big and we need pagination — but that's a v2 problem; first verify the queries are tight.

**Acceptance:**
- 7-day report: <5s (already works, regression check)
- 30-day report: <15s
- 90-day report: <30s
- Year-to-date report (≤365 days): <60s
- All three formats (PDF / CSV / Markdown) work for each range
- Verify on prod with Greg's `Ebenezer` farm which has real data

**Files likely touched:**
- `src/utils/reportGenerator.ts`
- Some `supabase/functions/*-report-*/index.ts` if the report is server-rendered
- The Reports page component (`src/components/reports/ReportsPage.tsx` or similar) — only if the issue is the client never gets a response

---

## Task 4 — Audit every nav item

Greg said *"some dont even work"* without specifying which.

**Process:**
1. Login as test2 (or any test account with data)
2. Click every item in the top nav: Dashboard, Flocks, Tasks, Eden AI
3. Open the hamburger menu and click every item: all 14
4. For each:
   - Did the page load? (no white screen, no console error)
   - Did it render content? (not stuck on a spinner)
   - Did the back button work?
   - Were there any 404s, 403s, or 500s in the network tab?

**Document results in a markdown checklist** in this PR's commit message. Format:

```
| Nav item | Status | Notes |
|---|---|---|
| Dashboard | ✅ | loads cleanly |
| Flocks | ✅ | loads cleanly |
| ...
| Reports (1-month) | ❌ | timeout >5min — Task 3 |
| ...
```

For any item that's broken: file as a separate sub-task in this same PR (one fix per commit), unless it's a major rewrite — in which case log as a follow-up bug for a separate PR.

**Acceptance:** every nav item in the cleaned-up menu loads cleanly on mobile and desktop. Broken items are either fixed in this PR or logged as separate bugs.

---

## Order of execution

1. **Task 3 first** (Reports timeout) — highest user impact, easiest to test
2. **Task 4 next** (Nav audit) — finds anything else broken before we restructure the menu
3. **Task 1 next** (Mobile menu grouping) — UX improvement after we know what's actually working
4. **Task 2 last** (Cooperatives removal) — smallest, cleanest, ships cleanly

---

## Cross-cutting acceptance gates (every task)

- TS budget at or below 180 (currently 147 — 33-error headroom)
- Critical-path zero
- All 131+ tests pass
- Bundle size delta logged in PR description
- Verified on prod after merge (test2 account, Greg's Ebenezer if accessible)

## Stop conditions

- TS regresses past 180 → revert offending commit
- Tests fail → revert
- Reports fix at 30-day still takes >30s after the fix → log the actual bottleneck and ship a smaller fix; don't over-engineer
- Any nav item from Task 4 needs >2 hours of fix time → log as separate PR

## Definition of done

- Mobile More menu is grouped into 5 sections (Production / Money / Operations / Insights / Account)
- Cooperatives no longer appears in nav
- Reports works at 7-day / 30-day / 90-day / year-to-date in <60s for any size
- All 18 nav destinations either work cleanly or are logged as a bug with a clear next step
- Greg verifies on his actual iPhone screenshots match expectation

## Estimated time

- Task 1 (mobile menu grouping): 2 hours
- Task 2 (Cooperatives removal): 30 min
- Task 3 (Reports timeout fix): 2-4 hours depending on root cause
- Task 4 (nav audit): 1 hour

**Total: ~5-7 hours of focused work.** Single PR, single deploy.
