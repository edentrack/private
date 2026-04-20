# Recover Farm Data (Ebenezer / Great Adigwe)

If your flocks and farm data are missing after running migrations or exiting support mode, use these steps.

---

## Step 1: Check what’s in the database

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Open the script **`supabase/scripts/check_my_farm_and_flocks.sql`** in your project.
3. Run it (email in the script is already `greatadigwe90@gmail.com`).

You’ll see:

- Your profile and user id  
- Each farm you own and **total_flocks** / **active_flocks** per farm  
- Every flock row for your farms (including archived)

- If **total_flocks** and **active_flocks** are 0 and the flocks list is empty, the data was removed (e.g. by a migration or cascade).
- If flocks exist but **active_flocks** is 0, they may be archived; the app only shows `status = 'active'`.

---

## Step 2: Restore from backup (if data was deleted)

Supabase can restore to a point in time **only if** your project has **Point-in-Time Recovery (PITR)** (e.g. Pro plan).

1. In **Supabase Dashboard** go to **Project Settings** → **Database**.
2. Check whether **Point-in-Time Recovery** is enabled.
3. If it is:
   - Go to **Database** → **Backups** (or **Restore**).
   - Choose **Restore to a point in time** and pick a time **before** you ran the cleanup/dedupe migrations (e.g. before 2026-02-26 or the day you ran them).
   - Restore to a **new project** (don’t overwrite production unless you’re sure), then point your app at the new DB or copy needed data back.

If PITR is not available, Supabase does not keep long-term backups you can restore from; you’d need to rely on your own backups if you have them.

---

## Step 3: If flocks exist but are not “active”

If the script shows flocks but with `status` other than `active` (e.g. `archived`), you can make them active again:

```sql
-- Run only if you confirmed flocks exist but are archived
UPDATE flocks
SET status = 'active'
WHERE farm_id IN (
  SELECT id FROM farms
  WHERE owner_id = (SELECT id FROM profiles WHERE email = 'greatadigwe90@gmail.com' LIMIT 1)
)
AND status IS DISTINCT FROM 'active';
```

Then refresh the app; the dashboard should list those flocks again.

---

## Step 4: If data was deleted and you can’t restore

If the script shows no flocks and you don’t have a backup or PITR:

- You’ll need to **recreate flocks and data** (e.g. “Create Flock” and re-enter records).
- The migrations we added were intended to:
  - Remove **duplicate** farms (one per owner, keeping the farm with the most flocks).
  - Remove **worker-owned** farms and **non-owner** members (clean slate).

They were not designed to delete an owner’s only farm or the farm that had flocks. If your only farm (Ebenezer) or its flocks were removed, it may have been due to:
- Multiple farm rows for the same owner and the wrong one being kept, or  
- Another migration/change run earlier.

Running **`check_my_farm_and_flocks.sql`** first will show exactly what’s left for your account and whether recovery or a simple “reactivate flocks” step is possible.
