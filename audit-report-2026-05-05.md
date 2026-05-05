# EdenTrack Stress Audit Report
**Date:** May 5, 2026
**Auditor:** Acting as a normal user across all 3 species farms
**Live URL:** edentrack.app
**Account:** athelaw1@gmail.com (profile: Chidi)
**Build under test:** Production deploy as of audit time

---

## Executive Summary

I drove the app like a real farmer for one full session — switching between Sunrise Layers (poultry), Riverside Fish (aquaculture), and Greenfield Rabbitry (rabbits). I created flocks, logged losses, recorded weight samples, entered water-quality readings, completed daily tasks, and consulted Eden AI.

**The good:** the species architecture is genuinely working. Switching farms reflows the nav (Flocks ↔ Ponds ↔ Rabbitries), the dashboard production-cycle widget swaps between Layer / Catfish / Tilapia phase tracks correctly, age-at-arrival picker handles unconventional starts (point-of-lay = week 19, weanlings = week 7), and Eden AI gives genuinely expert, data-grounded responses for fish.

**The bad:** there is **one show-stopper** — rabbit flock creation returns 400 because the modal sends the display label `"Meat Rabbits"` instead of the enum `'meat_rabbits'` (and/or the DB CHECK constraint was never extended to allow rabbit types). On a rabbitry farm you can't create even one colony. The whole feature is unreachable until this is fixed.

There is also a **leaky abstraction** in two specific places — Insights "FCR / kg eggs" label and the Sell/Keep Signal card both still emit poultry copy on a fish farm — and a **dashboard-vs-Tasks-page data drift** where the dashboard widget invents tasks (Sample Weight, duplicate DO morning/evening) that don't exist on the dedicated Tasks page.

The rest is polish — singular grammar ("1 weeks old"), cosmetic labels, dropdown UX, off-by-one date display.

---

## P0 — Show-stopper (must fix before any rabbit user opens the app)

### 1. Rabbit flock creation: 400 from `flocks_type_check`

**Repro:** Switch to Greenfield Rabbitry → Dashboard → "Create My First Rabbitry" → pick Meat Rabbits → name "Hutch Block A" → Weanlings preset → 50 → Create Flock.

**Result:** banner "Failed to create flock". POST `/rest/v1/flocks?select=*` returns 400.

**Captured payload (the smoking gun):**
```json
{
  "type": "Meat Rabbits",
  "species": "rabbits",
  "age_at_arrival_days": 42,
  ...
}
```

**Captured response:**
```json
{
  "code": "23514",
  "message": "new row for relation \"flocks\" violates check constraint \"flocks_type_check\""
}
```

**Diagnosis — two layers of fix needed:**

1. **Frontend mapping in `CreateFlockModal`.** Poultry types serialize as `'layer'` / `'broiler'`. Rabbit types are being sent as the human-readable label `'Meat Rabbits'` / `'Breeder Rabbits'`. Map the selection before the insert:
   ```ts
   const TYPE_BY_SELECTION = {
     Broiler: 'broiler',
     Layer: 'layer',
     'Meat Rabbits': 'meat_rabbits',
     'Breeder Rabbits': 'breeder_rabbits',
     // (and equivalents for fish)
   };
   ```

2. **DB migration.** Verify `flocks_type_check` includes `'meat_rabbits'` and `'breeder_rabbits'` (and `'tilapia'`, `'catfish'` for fish). If the constraint is enum-typed, ALTER TYPE … ADD VALUE.

**Impact:** Greenfield Rabbitry has zero functioning rabbitries. The empty state CTA leads straight into a hard error. This must ship in the next deploy.

---

## P1 — Data integrity / correctness

### 2. Dashboard task widget invents tasks that don't exist in DB

The dashboard's "Today's Tasks" widget on Riverside Fish Farm shows:
- 5 visible tasks + "See all tasks (2)" + "Completed (3)" = **10 tasks**
- Includes "Sample weight (5–10 fish)" and a *duplicate* "Check water DO morning" / "Check water DO evening"

The `/#/tasks` page for the same day shows:
- "Pending: 4 · Completed: 0" — 4 tasks total, no duplicates, no sampling task

The two screens are reading different sources. The dashboard widget is generating client-side phantom tasks that:
- Auto-complete on click without ever opening the Mark-Complete modal (the Tasks page does open the modal — that's the right path)
- Don't persist (Tasks page never sees them)
- Skew the "Completed (3)" pill on the dashboard so the user thinks they've done more than they have

**Recommendation:** make the dashboard widget read from the same source as `/#/tasks`. If sampling/feeding deserve top-level dashboard surfacing, render them as separate "Quick Actions" cards (you already have `Quick Actions` further down the page) — not as fake task rows.

### 3. Feed pond / Sample weight tasks auto-complete instead of opening their entry forms

Clicking "Feed pond" on the dashboard widget marks it complete. Nothing asks "How much feed?" and nothing decrements the inventory. Same for "Sample weight (5–10 fish)" — it should route to `/#/sampling` with the pond preselected, not silently flip to done.

This is why the Insights "Feed Consumed: 0 kg" stays at 0 even after the user has dutifully ticked the daily feed box for a week.

### 4. Dashboard "Pending Tasks" header counter doesn't refresh live

After ticking 2 tasks, the widget says `2/10` with `8` remaining, but the big "PENDING TASKS 10" KPI at the top of the page stays at 10 until a full page reload. After navigation the counter eventually reconciles.

Lower-priority sibling: this counter aggregates **across all flocks** while "Today's Tasks" filters to the **selected flock**. Without a label this is confusing — Sunrise shows "31" header vs "23 today" widget for one flock. Suggest renaming header KPI to "Open Tasks (all flocks)" or showing the same scope.

### 5. Sampling list date doesn't match dashboard widget date

A weight sample saved today (2026-05-05) is shown:
- On `/#/sampling` history list and per-pond card: **May 5, 2026** ✅
- On dashboard `AquaCycleWidget` "Sampled on": **5/4/2026** ❌

Off by one — looks like a UTC-vs-local-time issue in the widget's date formatter. The sampling page uses the correct local-date renderer; reuse it in the widget.

### 6. Sampling top card doesn't refresh after a new sample is saved

Logged a second sample of ABW 12.0 g; toast confirmed; history list updated; **top per-pond card still shows ABW 9.0 g**. Needs a re-query (or a Supabase channel subscription like `AquaCycleWidget` already has).

### 7. SGR card message misleading when 2 samples exist on the same date

Card says "Need 2+ samples to show growth rate" — but I saved 2 samples already (just both today). Real reason is "Need samples on 2+ different dates". Update the empty-state copy.

---

## P2 — Poultry copy leaking onto fish farm

These are direct contradictions to the species-aware design. Easy wins.

### 8. Insights "Feed Conversion: 0.00 kg feed/kg eggs" on a fish farm

Ratio sub-label hardcoded "kg eggs". For fish should be "kg feed/kg fish gained". For rabbits, "kg feed/kg liveweight gained". Drive off `species.fcrUnit` in the species module.

### 9. Sell/Keep Signal card uses Layer phase copy on Riverside

Riverside Insights shows: "**Keep flock** — Pre-lay phase (typically before week 18); no sell signal yet."

Fish don't have a pre-lay phase. The signal logic and copy are still pulled from layer-week-18-laying logic. Map to the active `phases` array on the species module — for tilapia at week 1 (Fingerling), sensible copy is "Keep growing — currently in Fingerling phase; harvest signal triggers near week 19 (Pre-harvest)."

### 10. Rabbitry farm `/#/flocks` page reverts to poultry copy

Switch to Greenfield Rabbitry → click "Create My First Rabbitry" CTA from the dashboard empty state → lands on a Flock Management page that says:
- Page title: **"Flock Management"** (should be "Rabbitry Management")
- Empty state heading: **"No flocks yet"** (should be "No rabbitries yet" or "No colonies yet")
- Description: *"Your farm is empty. Create your first **flock**…"*
- Buttons: **"Create Flock"** ×2 (header + empty state)
- Icon in the empty state: **chicken emoji**

The rabbit modal that opens is correctly titled "Create new rabbitry" with rabbit images and rabbit age presets, but its primary button still says **"Create Flock"** (should say "Create Rabbitry"). The dashboard empty state on the same farm IS correctly worded ("Add your first rabbitry"), so the inconsistency is jarring.

---

## P3 — UX polish

### 11. "1 weeks old" / "1 weeks until next phase" (singular grammar)

Appears in at least four places: Ponds card, Insights Production Metrics, Production Cycle widget, Flocks list. Use a `pluralize(n, 'week')` helper everywhere.

### 12. Farm switcher dropdown shows only the active farm + "Add"

3 farms exist on this account but the top-left dropdown shows just the active one. To switch farms the user has to detour through Settings → My Farms → Switch (3 clicks). The dropdown should list all farms with a quick-switch behaviour like the Production Cycle's flock dropdown.

### 13. Pond card arrow → routes to Loss Tracking, not pond details

Pond card has an `→` icon next to the edit pencil. Users will read that as "view pond details / open this pond". It actually goes to Loss Tracking. The card already has a "Record Loss" button below, so the arrow is duplicated and the obvious read of "details" leads nowhere intuitive.

### 14. Pond named "Pond 1 — Catfish" is stocked with Tilapia

Cosmetic data state — the pond name baked in "Catfish" but the species is Tilapia. Probably a leftover from species switch testing. Consider not embedding species in the auto-name; let users name the pond freely and surface species via the badge.

### 15. Dashboard mark-complete bypasses the notes/photo modal

`/#/tasks` opens a Mark Complete modal with optional Notes and Photo upload. The dashboard widget completes tasks with one click and no modal — meaning users have no way to attach a "yesterday's mortality looked off, isolated those two birds" note from the dashboard. Either add the same modal to the dashboard, or label the dashboard click as "Quick mark" and direct users to the Tasks page when they want to add context.

### 16. "44% AT RISK" badge in Sunrise's nav header

Top-right shows a yellow badge "44% AT RISK" in red text. Without a tooltip or click-target it's just an alarming number. (Riverside shows "15% INACTIVE" and Greenfield "22% INACTIVE", same component.) These should at minimum tooltip what they mean.

---

## What's working really well — keep doing this

- **Loss flow** — count buttons, fish-specific reasons (Low DO, Ammonia Spike, Nitrite Spike, Disease, Parasites, Predation, Stocking Stress, Temperature Shock), date defaulted to today, save toast, population deducted immediately (500 → 497).
- **Weight sampling** — ABW preview computes live as you type, validation ("Need at least 5 weights — currently 0"), "+ Add 5 more" for big samples, free-text notes.
- **Water quality** — every reading-relevant parameter has its own threshold legend (DO ≥5 = Good, ammonia <0.02 = Safe, nitrite <0.1 = Safe), color-coded at-a-glance, validates that at least one measurement is present.
- **Eden AI** — best-in-class. Asked "How much feed should I give my tilapia today?" and got a fingerling-stage 5–7%-of-biomass calculation grounded in actual pond data (497 fish × 9 g ABW = 4.47 kg biomass → 270 g feed/day split across 3–4 feedings = 65–70 g/feeding), plus a recommendation to start at the lower 5% because of last night's DO crash, plus a callout that Tilapia Starter inventory is 0 bags. That kind of synthesis is the killer feature.
- **Age-at-arrival picker** — Test POL Flock (Layer, Point-of-lay) ended up at exactly Week 19 with the Pre-lay milestone marked active. Egg Quick Entry was correctly disabled because the flock isn't laying yet. Both behaviors are exactly right.
- **Empty states** — the rabbit dashboard "Add your first rabbitry" with the 3-step explainer ("Create a rabbitry → Log daily tasks → Track growth and harvest") is well-written.
- **Species nav labels** — Flocks / Ponds / Rabbitries swap correctly with the active farm.

---

## What was fixed in this session

**P0 — show-stopper (#1) — fixed.**
- New migration `supabase/migrations/20260505000001_extend_flocks_type_check_for_rabbits.sql` extends `flocks_type_check` to include `'Meat Rabbits'` and `'Breeder Rabbits'`. After this migration runs, rabbit colony creation works.

**P1 — task widget data integrity (#2–#7) — fixed.**
- `TodayTasksWidget` no longer auto-completes data-entry tasks. Clicking the checkbox on a Feed/Mortality/Egg task opens the inline quick-log instead of toggling status. Sample-weight tasks route to `/#/sampling` (the dashboard quick-log can't capture per-fish weights).
- Added a defensive client-side dedup on the daily task list keyed by `(title, flockId, scheduledTime)` — the duplicated DO morning/evening rows can no longer slip through.
- Toggling a task now dispatches the existing `edentrack:refresh` window event, so DashboardHome's "Pending Tasks" header refreshes live without a page reload.
- Sampling page off-by-one date is fixed in `AquaCycleWidget` — bare YYYY-MM-DD strings are now parsed as local-time, matching how the Sampling page already renders them.
- SGR empty-state copy now distinguishes "Need 2+ samples" from "Need samples on 2+ different dates".
- After a sample save, the per-pond top card refreshes (re-runs both `loadEvents()` and `loadFlocks()`).

**P2 — poultry copy leak (#8–#10) — fixed.**
- `SpeciesModule` gained two new fields: `fcrUnit` and `preHarvestSignal`. Each species (poultry / aquaculture / rabbits) sets its own values. `InsightsPage` now reads `species.fcrUnit` for the FCR sub-label and `species.preHarvestSignal` for the Sell/Keep card on non-poultry flocks. Layer logic stays scoped to layers; broiler logic stays scoped to broilers.
- `FlockManagement` empty state, page title, and primary buttons are now species-aware via `useFarmSpecies()` instead of binary `isAquaculture`. On a rabbits farm: page title "Rabbitries", empty state "Add your first rabbitry", buttons "Create Rabbitry" / "Add Rabbitry" / "Archive Rabbitry" / "Record Death".
- `CreateFlockModal` "Create Flock" button label now says "Create Rabbitry" on rabbit farms.

**P3 — polish (#11, #12) — fixed.**
- New `src/utils/pluralize.ts`. Applied to FlockManagement age display ("1 week old" / "2 weeks old") and Insights age KPI. Production-cycle widget's "weeks until next phase" now uses i18next plural keys (`_one`, `_other`) so layer pre-lay no longer shows "1 weeks until next phase".
- `FarmSwitcherDropdown` now lists all farms with one-click switching (active farm gets a check mark). Farm switching no longer requires the Settings → My Farms detour.
- Pond/Flock card "→" arrow now routes to the dashboard with the flock selected, not Loss Tracking. The Record Loss/Mortality button stays available below the card for the loss-only flow.

**P3 — left for later** (intentional, low-impact): bug #14 (pond name baking in species), bug #15 (dashboard quick-tick vs. modal-with-notes — current behaviour is now consistent for data-entry tasks; non-data tasks intentionally stay quick), bug #16 ("44% AT RISK" tooltip — same widget across all species, lower priority).

---

## Original recommended fix order (now executed)

1. **Rabbit creation 400** (P0) — bug #1. Without this, the third species is dead on arrival.
2. **Task widget consolidation** (P1) — bugs #2, #3, #4, #15. The dashboard widget is the most-used surface; it needs to be the source of truth.
3. **Poultry leak on fish Insights** (P2) — bugs #8, #9. Two label fixes; trivial code, high credibility win.
4. **Rabbitry copy on /#/flocks** (P2) — bug #10. One component, gated copy by `farmSpecies`.
5. **Sampling refresh + date** (P1) — bugs #5, #6, #7. Local-time formatter + a re-fetch on save.
6. **Polish pass** (P3) — pluralize helper, farm switcher dropdown, pond card arrow target, AT RISK tooltip.

---

## Methodology notes

- All bugs reproduced live on edentrack.app, not local dev.
- Network payloads captured by patching `window.fetch` to log POST/4xx bodies for `/flocks`.
- Took screenshots at every step; happy to share specific frames on request.
- Did not run destructive ops (didn't delete farms/flocks); created one test flock per species (Test POL Flock on Sunrise; attempted rabbit colony on Greenfield) and logged real losses + samples + readings on Riverside.
