-- =============================================================================
-- Fix: invited workers should see YOUR farm as workers, not their own farm.
-- 1) Remove farms owned by anyone who was ever invited (they become workers only).
-- 2) Ensure every accepted invitation has a farm_members row (worker/manager/viewer).
-- One-time data fix; safe to run multiple times.
-- =============================================================================

SET LOCAL row_security = off;

-- Step 1: Delete farms owned by users whose email appears in team_invitations.
WITH invited_emails AS (
  SELECT DISTINCT lower(trim(invited_email)) AS email
  FROM team_invitations
),
invited_user_ids AS (
  SELECT p.id AS user_id
  FROM profiles p
  JOIN invited_emails e ON lower(trim(p.email)) = e.email
),
farms_to_remove AS (
  SELECT f.id AS farm_id
  FROM farms f
  JOIN invited_user_ids i ON f.owner_id = i.user_id
)
DELETE FROM farms
WHERE id IN (SELECT farm_id FROM farms_to_remove);

-- Step 2: For each accepted invitation, ensure farm_members has a row.
INSERT INTO farm_members (farm_id, user_id, role, is_active, invited_by, invited_at, joined_at)
SELECT
  ti.farm_id,
  p.id,
  (CASE
    WHEN lower(trim(ti.role)) IN ('manager', 'viewer') THEN lower(trim(ti.role))
    ELSE 'worker'
  END)::membership_role,
  true,
  ti.invited_by,
  coalesce(ti.created_at, now()),
  now()
FROM team_invitations ti
JOIN profiles p ON lower(trim(p.email)) = lower(trim(ti.invited_email))
WHERE (ti.status = 'accepted' OR (ti.accepted_at IS NOT NULL))
  AND NOT EXISTS (
    SELECT 1 FROM farm_members fm
    WHERE fm.farm_id = ti.farm_id AND fm.user_id = p.id
  )
ON CONFLICT (farm_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  is_active = true,
  updated_at = now();
