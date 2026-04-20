-- =============================================================================
-- One-time cleanup: remove farms owned by users who were invited as workers.
-- Run in Supabase SQL Editor. Fixes "two accounts" / "made them owners" issue.
-- =============================================================================
-- Users whose email appears in team_invitations should not own a farm;
-- they should only have farm_members rows (as worker/manager/viewer).

SET LOCAL row_security = off;

WITH invited_emails AS (
  SELECT DISTINCT lower(trim(invited_email)) AS email
  FROM team_invitations
),
invited_user_ids AS (
  SELECT p.id AS user_id
  FROM profiles p
  JOIN invited_emails e ON lower(trim(p.email)) = e.email
),
farms_owned_by_invited AS (
  SELECT f.id AS farm_id
  FROM farms f
  JOIN invited_user_ids i ON f.owner_id = i.user_id
)
DELETE FROM farms
WHERE id IN (SELECT farm_id FROM farms_owned_by_invited);

-- Optional: see how many were deleted
-- SELECT count(*) FROM farms_owned_by_invited;
