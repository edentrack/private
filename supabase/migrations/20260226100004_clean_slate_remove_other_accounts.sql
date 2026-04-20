/*
  # Clean slate: remove other accounts so you can start over

  This migration:
  1. Deletes farms that were created by workers (farms whose owner is also
     a worker/manager/viewer on another farm).
  2. Removes ALL non-owner members from ALL farms (every worker, manager, viewer).
     Only farm owners remain. Your farm and your owner membership are unchanged.

  After running:
  - Only you (and any other farm owners) still have access to your farm(s).
  - The "other accounts" (invited workers/managers/viewers) no longer have
    any farm access; if they log in they will see "No farm assigned".
  - To fully remove those user accounts from the system, run the optional
    script in supabase/scripts/delete_orphan_accounts.sql (or delete them
    manually in Supabase Dashboard > Authentication > Users).
*/

-- Step 1: Delete farms owned by users who are also workers/managers/viewers elsewhere
DELETE FROM farms
WHERE id IN (
  SELECT f.id
  FROM farms f
  WHERE EXISTS (
    SELECT 1 FROM farm_members fm
    WHERE fm.user_id = f.owner_id
      AND fm.farm_id <> f.id
      AND fm.role IN ('worker', 'manager', 'viewer')
      AND fm.is_active = true
  )
);

-- Step 2: Remove all worker, manager, and viewer memberships from every farm.
-- Only owner memberships remain.
DELETE FROM farm_members
WHERE role IN ('worker', 'manager', 'viewer')
  AND is_active = true;
