# Brief — Phase 4: TS cleanup to under 100

**Supersedes:** the Phase 4 section in `CLAUDE_CODE_AUTONOMOUS_ROADMAP.md` (which is stale — quoted baseline 367, current is 277 after the merge train).

**Status:** ready to start. No external blockers.

**Owner:** Claude Code.
**Working directory:** `/Users/greatadigwe/Documents/edentrack`
**Branch model:** three sequential PRs (#TS-A, #TS-B, #TS-C), each must merge cleanly before the next starts.

---

## Why we're doing this

TS errors are not crashing prod, but every refactor against a 277-error baseline is slower than it needs to be — every new error mixes into the noise and every legitimate type-safety win is invisible. Real bugs hide in the noise. Three of the top-error files (`pdfGenerator`, `reportGenerator`, `predictiveAnalytics`) have errors in the financial-reporting path, which is the single highest-blast-radius surface in the app.

Goal: drive baseline from 277 → under 100 in three PRs, then lower the CI gate so we never drift back.

## Current state (verified May 6, 2026)

```
Baseline:        277 errors
Top files:
  20  src/components/expenses/ExpenseTracking.tsx
  18  src/components/tasks/DailyTaskTemplates.tsx
  16  src/components/dashboard/DailySummaryCard.tsx
  14  src/components/dashboard/DashboardHome.tsx
   8  src/utils/eggInventory.ts
   7  src/components/weight/EditFeedWaterModal.tsx
   7  src/components/tasks/egg/EggIntervalTaskTracker.tsx
```

Error-class distribution:
- **TS6133** (declared but never read): **141 errors** — the big bucket
- TS2322 / TS2741 / TS2345 / TS2339 — the rest, scattered

The TS6133 bucket is the highest-leverage target because most of those are mechanical (unused imports, dead state setters, stale refactor leftovers from the merge train).

## PR #TS-A — Mechanical TS6133 sweep

**Target: 277 → ≤180 errors** (bring TS6133 from 141 → ≤45)

### Process

1. `npm run typecheck 2>&1 | grep "error TS6133" > /tmp/ts6133.txt` to get the full list (141 entries).
2. For each error, classify:
   - **Pure unused import** (col 1 or col 8 = line start) → remove from import statement. 13 of these — safest first batch.
   - **Unused destructured param** (e.g. `({ onClick, currentFarm }) =>` where `currentFarm` unused) → prefix with `_`. TypeScript treats `_currentFarm` as intentionally unused.
   - **Unused destructured useState setter** (`const [foo, setFoo] = useState()` where `setFoo` unused) → either remove the destructure entirely if `foo` is also dead, or `_setFoo`.
   - **Unused local variable** declared then never referenced → check git blame: if it was a recent refactor leftover, remove. If older and looks like a placeholder for planned work, prefix with `_`.
   - **Unused function parameter required by a callback signature** (e.g. `(_index, _arr)` style) → prefix with `_`, do NOT remove (would break the contract).
3. After each file, run `npm run typecheck 2>&1 | grep -c "error TS"` and confirm count strictly went down. Never up. Never the same.
4. Commit per file, not per batch — easier to bisect if something breaks.

### Files to prioritize in this PR (by impact)

```
src/components/dashboard/DailySummaryCard.tsx   (8 TS6133)
src/components/dashboard/DashboardHome.tsx       (10 TS6133)
src/components/expenses/ExpenseTracking.tsx      (~6 TS6133)
src/components/tasks/DailyTaskTemplates.tsx      (~10 TS6133)
src/components/landing/*.tsx                     (~4 TS6133)
src/components/help/HelpButton.tsx, HelpModal.tsx (2 TS6133, both 'React' unused)
```

### Verification gate

- `npm run typecheck` → ≤180 errors
- `npm run build` → green, no warnings about removed identifiers
- `npm test` → all tests pass
- Open the prod app post-merge, click through Dashboard / Expenses / Tasks / Landing — no runtime regressions

### Stop conditions (rollback this PR)

- Typecheck count goes UP at any point during the sweep
- Any test fails that was passing before
- Removing an unused import causes a runtime error (means it had a side effect; restore it and add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` instead)

---

## PR #TS-B — Critical-path financial files

**Target: ≤180 → ≤100 errors**

### Critical files (must be 0 errors after this PR)

```
src/utils/pdfGenerator.ts
src/utils/reportGenerator.ts
src/utils/creditworthinessPDF.ts   (new from PR #29)
src/utils/cashFlow.ts              (if exists)
src/components/expenses/**/*
src/components/sales/**/*
src/components/payroll/**/*
```

### Common error patterns + fixes

- **`Color | undefined`** in jsPDF calls → import jsPDF Color type, ensure `[r, g, b]` tuples typed as `[number, number, number]` not `number[]`.
- **`Argument of type 'X' is not assignable to parameter of type 'Y'`** in autoTable → use the `RowInput[]` type from jspdf-autotable.
- **Spread argument type errors** → type the args explicitly before spreading.
- **`Property 'X' does not exist on type 'Y'`** for Supabase row types → regenerate types via `supabase gen types typescript --project-id mnxnoggxdgijsbdhgzwc > src/types/database.ts` before fixing manually.

### Verification gate

- `npm run typecheck -- src/utils/pdfGenerator.ts` → 0 errors
- `npm run typecheck -- src/utils/reportGenerator.ts` → 0 errors
- Generate a credit report PDF on staging — opens, all fields populated, no console errors
- Generate a financial summary PDF on staging — same
- Total baseline ≤ 100

---

## PR #TS-C — CI gate hardening

**Target: lock in the gains so we never regress past this baseline**

### Changes

1. Update `.github/workflows/ci.yml`:
   ```yaml
   - name: TS error budget
     run: |
       errs=$(npm run typecheck 2>&1 | grep -c "error TS")
       if [ "$errs" -gt 100 ]; then
         echo "::error::TS error count $errs exceeds budget of 100"
         exit 1
       fi
   ```
2. Add a separate critical-path gate:
   ```yaml
   - name: Critical-path zero-error gate
     run: |
       npx tsc --noEmit -p tsconfig.app.json 2>&1 | \
         grep -E "src/(utils/(pdfGenerator|reportGenerator|creditworthinessPDF)\.ts|components/(expenses|sales|payroll)/)" | \
         grep "error TS" && exit 1 || exit 0
   ```
3. Test the gates by intentionally breaking each in a throwaway PR — confirm CI blocks merge.
4. Update `package.json` `scripts.typecheck` to include error budget check locally:
   ```json
   "typecheck": "tsc --noEmit -p tsconfig.app.json && bash scripts/ts-budget.sh"
   ```
5. Add `scripts/ts-budget.sh` that prints current count + the budget so engineers see the gap.

### Verification gate

- Throwaway PR with intentional new TS error → CI blocks merge ✓
- Throwaway PR with intentional new error in critical path → CI blocks even if total is within budget ✓
- Main is clean

---

## What this brief does NOT cover

- Refactoring code architecture. This is purely type cleanup. Don't restructure files, don't extract utilities, don't change runtime behavior.
- Generating new Supabase types. If you find a type-mismatch caused by stale generated types, regenerate them in a separate PR before fixing the consumer.
- Migrating away from `any`. Existing `any` usage stays. Reducing `any` is its own future phase.

## Stop conditions across all 3 PRs

- Total runtime regression (any feature broken on prod)
- Test failures
- Merge conflicts that take > 30 min to resolve — pause and ask Greg
- Bundle size grows by > 5% (a removed import you thought was dead was actually used and re-added incorrectly)

## Definition of done

- TS baseline ≤ 100
- Zero TS errors in `pdfGenerator.ts`, `reportGenerator.ts`, `creditworthinessPDF.ts`, `expenses/`, `sales/`, `payroll/`
- CI budget gate active and tested
- Critical-path zero-error gate active and tested
- Greg confirms no functional regressions in 3-tenant verification

After this brief: Phase 4 in the master roadmap is closed.
