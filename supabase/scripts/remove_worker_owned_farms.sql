-- =============================================================================
-- REMOVE FARMS CREATED BY WORKERS (run in Supabase SQL Editor if needed)
-- =============================================================================
-- This removes farms where the owner is also a worker/manager/viewer on another
-- farm (e.g. your invited workers who accidentally got their own farm). After
-- running, those users only have their membership under your farm.
--
-- STEP 1 (optional): Preview which farms will be removed
-- =============================================================================
SELECT f.id, f.name AS farm_name, f.created_at, p.full_name, p.email
FROM farms f
JOIN profiles p ON p.id = f.owner_id
WHERE EXISTS (
  SELECT 1 FROM farm_members fm
  WHERE fm.user_id = f.owner_id
    AND fm.farm_id <> f.id
    AND fm.role IN ('worker', 'manager', 'viewer')
    AND fm.is_active = true
);

-- =============================================================================
-- STEP 2: Delete those farms (related data CASCADE deletes)
-- =============================================================================
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
