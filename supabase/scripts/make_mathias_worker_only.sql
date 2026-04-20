-- =============================================================================
-- MAKE MATHIAS A WORKER ONLY (remove his farm ownership)
-- Run this in Supabase SQL Editor.
-- After this, Mathias will no longer own "Mathias Nsoh's Farm" and will only
-- show as a worker on whichever farm(s) he is a member of (e.g. yours).
-- =============================================================================

SET LOCAL row_security = off;

DO $$
DECLARE
  v_mathias_id uuid;
  v_deleted_count int;
BEGIN
  SELECT id INTO v_mathias_id
  FROM profiles
  WHERE lower(email) = 'nsohmathias614@gmail.com'
  LIMIT 1;

  IF v_mathias_id IS NULL THEN
    RAISE NOTICE 'Mathias (nsohmathias614@gmail.com) not found. Nothing to do.';
    RETURN;
  END IF;

  -- Delete all farms where Mathias is the owner.
  -- CASCADE will remove farm_members rows for those farms.
  WITH deleted AS (
    DELETE FROM farms
    WHERE owner_id = v_mathias_id
    RETURNING id
  )
  SELECT count(*)::int INTO v_deleted_count FROM deleted;

  RAISE NOTICE 'Removed % farm(s) owned by Mathias. He now only has his worker/member access on other farms.', v_deleted_count;

  -- Ensure any remaining membership is worker (optional: uncomment to force role)
  -- UPDATE farm_members SET role = 'worker', updated_at = now() WHERE user_id = v_mathias_id AND role != 'owner';
END $$;
