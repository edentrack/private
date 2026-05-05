# RLS Audit — EdenTrack Supabase

**Generated:** 2026-05-05 · **Scope:** every farm-scoped table referenced by `src/`

This is a **client-side** audit of RLS expectations. It enumerates every table the
app reads/writes and the RLS policy each one *should* have so a user can never
read or modify another farm's data even if a query forgets `farm_id`.

To verify on the server, the steps in **Verification** below run two queries as
two different users and confirm cross-tenant rows are rejected.

---

## Summary

| Class of table | Count | Required RLS shape |
|---|---:|---|
| Farm-scoped (`farm_id` column) | 27 | `farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid())` |
| User-scoped (`user_id` column, no farm_id) | 4 | `user_id = auth.uid()` |
| Membership / auth | 3 | bespoke (see below) |
| Global / read-only | 5 | `true` for SELECT, restricted for INSERT/UPDATE/DELETE |

---

## Farm-scoped tables — 27

Every table in this list MUST have RLS enabled and 4 policies (SELECT / INSERT / UPDATE / DELETE) all of the form:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_select_by_farm_membership" ON <table>
  FOR SELECT USING (
    farm_id IN (
      SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid()
    )
  );

CREATE POLICY "<table>_insert_by_farm_membership" ON <table>
  FOR INSERT WITH CHECK (
    farm_id IN (
      SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid()
    )
  );

CREATE POLICY "<table>_update_by_farm_membership" ON <table>
  FOR UPDATE USING (
    farm_id IN (
      SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid()
    )
  ) WITH CHECK (
    farm_id IN (
      SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid()
    )
  );

CREATE POLICY "<table>_delete_by_farm_membership" ON <table>
  FOR DELETE USING (
    farm_id IN (
      SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid()
    )
  );
```

### Tables to verify

1. `flocks`
2. `expenses`
3. `revenues`
4. `egg_collections`
5. `egg_inventory`
6. `egg_sales`
7. `bird_sales`
8. `weight_logs`
9. `vaccinations`
10. `mortality_logs`
11. `feed_inventory`
12. `feed_stock`
13. `feed_givings`
14. `feed_usage_logs`
15. `feed_types`
16. `inventory_usage`
17. `inventory_movements`
18. `other_inventory_items`
19. `other_inventory_movements`
20. `tasks`
21. `task_templates`
22. `pond_inspections` (Phase B Step 16 will create this)
23. `pond_growth_targets` (Phase B Step 8 will create this)
24. `sales_invoices`
25. `invoice_items`
26. `sales_receipts`
27. `receipt_items`
28. `receipt_refunds`
29. `customers`
30. `payroll_runs`
31. `payroll_items`
32. `pay_stubs`
33. `shifts`
34. `imports`
35. `import_items`
36. `activity_logs`
37. `notifications` *(also has `user_id` for per-user filtering)*
38. `water_quality_readings`
39. `harvest_records`
40. `stocking_events`
41. `flock_targets`
42. `farm_settings`

> Run the policy check in **Verification → Step 1** to confirm each of these has
> RLS enabled and the four policies above.

---

## User-scoped tables — 4

These are scoped to `auth.uid()` directly, NOT to farm membership:

| Table | RLS shape |
|---|---|
| `profiles` | `id = auth.uid()` (one row per user) |
| `notifications` | `user_id = auth.uid()` |
| `support_tickets` | `user_id = auth.uid()` (also `(SELECT is_admin())` for admins) |
| `user_preferences` | `user_id = auth.uid()` |

---

## Membership / auth tables — 3

| Table | RLS shape |
|---|---|
| `farms` | SELECT: row must be in `farm_members` for `auth.uid()`. INSERT: any authenticated user. UPDATE/DELETE: owner role only |
| `farm_members` | SELECT: rows where `user_id = auth.uid()` OR rows for any farm where `auth.uid()` is owner/manager. INSERT/UPDATE/DELETE: owner role only |
| `farm_invitations` | SELECT: rows where invitee email matches `auth.email()` OR farm has `auth.uid()` as owner. INSERT: owner-only. UPDATE: invitee accepts/declines |

---

## Global / read-only tables — 5

| Table | RLS shape |
|---|---|
| `broadcasts` / `announcements` | SELECT: `true`. INSERT/UPDATE/DELETE: `is_admin()` only |
| `feature_flags` | SELECT: `true`. Mutations: `is_admin()` only |
| `app_settings` | SELECT: `true`. Mutations: `is_admin()` only |
| `subscription_history` | SELECT: `user_id = auth.uid()` OR `is_admin()`. Writes: service role only |
| `subscriptions` | Same as above |

---

## Verification — run these in Supabase SQL Editor

### Step 1 — Enumerate tables missing RLS

```sql
-- Lists every public table whose RLS is disabled. For an audit-clean run,
-- the only entries should be tables in the "Global / read-only" list above.
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'flocks','expenses','revenues','egg_collections','egg_inventory',
    'egg_sales','bird_sales','weight_logs','vaccinations','mortality_logs',
    'feed_inventory','feed_stock','feed_givings','feed_usage_logs','feed_types',
    'inventory_usage','inventory_movements','other_inventory_items',
    'other_inventory_movements','tasks','task_templates',
    'sales_invoices','invoice_items','sales_receipts','receipt_items',
    'receipt_refunds','customers','payroll_runs','payroll_items',
    'pay_stubs','shifts','imports','import_items','activity_logs',
    'water_quality_readings','harvest_records','stocking_events',
    'flock_targets','farm_settings','notifications'
  )
ORDER BY tablename;
```

Expected: `rls_enabled = true` for every row.

### Step 2 — Enumerate policies per table

```sql
-- Every farm-scoped table should have at least 4 policies (one per command).
-- This query lists how many policies each table has and the commands they cover.
SELECT
  tablename,
  cmd,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
ORDER BY tablename, cmd;
```

Expected: every farm-scoped table appears 4 times (SELECT / INSERT / UPDATE / DELETE).

### Step 3 — Cross-tenant smoke test (the real test)

Create two test users on two farms, then verify that User B can't read User A's data.

```sql
-- Run as User A (anon key, signed in as a@example.com):
INSERT INTO expenses (farm_id, amount, category, incurred_on)
  VALUES ('<user-a-farm-id>', 1000, 'feed', '2026-05-05')
  RETURNING id;

-- Run as User B (anon key, signed in as b@example.com):
SELECT * FROM expenses WHERE farm_id = '<user-a-farm-id>';
-- Expected: zero rows. If any row comes back, RLS is misconfigured on this table.

-- Repeat for every table in the "Farm-scoped tables" list above.
-- Easiest is a small Postgres script that loops over the table list and
-- attempts a SELECT scoped to a foreign farm_id, asserting zero rows.
```

### Step 4 — Insert with foreign farm_id should fail

```sql
-- As User B, try to write to User A's farm:
INSERT INTO expenses (farm_id, amount, category, incurred_on)
  VALUES ('<user-a-farm-id>', 99999, 'feed', '2026-05-05');
-- Expected: error "new row violates row-level security policy".
```

If any of the above tests fail, fix the policy and re-run.

---

## Known gaps to close

The client-side audit (`MULTITENANCY_AUDIT.md`) found cases where queries scope only by `id` or `flock_id` without `farm_id`. Those are fixed in PRs #1, #3 (multi-tenancy batches 1-4). RLS is the second line of defense; this document specifies what that line should look like.

A few tables created in newer migrations may not have full RLS yet — verify against this list:
- `pond_inspections` — to be created in Phase B Step 16
- `pond_growth_targets` — to be created in Phase B Step 8
- `pond_alerts` — to be created in Phase B Step 24

Each new migration must include the 4-policy block at table creation time.

---

## How to apply missing policies

If Step 1 or Step 2 above shows a table missing RLS or policies, add a migration:

```sql
-- supabase/migrations/<timestamp>_enforce_rls_on_<table>.sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Then add the 4 policies from the template at the top of this file,
-- substituting <table> for the actual name.
```

Apply with `supabase db push` (staging first, then prod).
