-- =============================================================================
-- REMOVE ALL TRACE OF MATHIAS AND DIRAL (Tchouatcha Fomen Diral)
-- Run this in Supabase SQL Editor as a one-time cleanup.
-- After running, delete the two users in: Authentication > Users (manual).
-- =============================================================================

-- Bypass RLS so deletes succeed (e.g. super_admin_impersonation_logs); requires superuser.
SET LOCAL row_security = off;

DO $$
DECLARE
  v_mathias_id uuid;
  v_diral_id uuid;
  v_ids uuid[] := '{}';
BEGIN
  -- Resolve user IDs by email (case-insensitive)
  SELECT id INTO v_mathias_id FROM profiles WHERE lower(email) = 'nsohmathias614@gmail.com' LIMIT 1;
  SELECT id INTO v_diral_id FROM profiles WHERE lower(email) = 'fomendiral23@gmail.com' LIMIT 1;

  IF v_mathias_id IS NOT NULL THEN v_ids := array_append(v_ids, v_mathias_id); END IF;
  IF v_diral_id IS NOT NULL THEN v_ids := array_append(v_ids, v_diral_id); END IF;

  IF array_length(v_ids, 1) IS NULL THEN
    RAISE NOTICE 'No matching users found for nsohmathias614@gmail.com or fomendiral23@gmail.com';
    RETURN;
  END IF;

  -- 0) Delete impersonation logs first (target_user_id is NOT NULL; FK may be ON DELETE SET NULL)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'super_admin_impersonation_logs') THEN
    DELETE FROM super_admin_impersonation_logs WHERE target_user_id = ANY(v_ids);
  END IF;

  -- 1) Remove farm memberships (they lose access to all farms)
  DELETE FROM farm_members WHERE user_id = ANY(v_ids);

  -- 2) Remove invitations sent to them
  DELETE FROM team_invitations
  WHERE lower(invited_email) IN ('nsohmathias614@gmail.com', 'fomendiral23@gmail.com');

  -- 3) Remove activity log entries where they are actor or target
  DELETE FROM team_activity_log
  WHERE actor_user_id = ANY(v_ids) OR target_user_id = ANY(v_ids);

  -- 4) Worker pay rates (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'worker_pay_rates') THEN
    DELETE FROM worker_pay_rates WHERE user_id = ANY(v_ids);
  END IF;

  -- 5) Worker shifts reference auth.users; will be removed when you delete users in Auth dashboard.
  --    Optionally delete now by user id (worker_id in worker_shifts is auth user id, same as profile id):
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'worker_shifts') THEN
    DELETE FROM worker_shifts WHERE worker_id = ANY(v_ids);
  END IF;

  -- 6) Null out recorded_by / invited_by etc. so we can delete profiles (avoid FK errors)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_usage' AND column_name = 'recorded_by') THEN
    UPDATE inventory_usage SET recorded_by = NULL WHERE recorded_by = ANY(v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'egg_collections' AND column_name = 'collected_by') THEN
    UPDATE egg_collections SET collected_by = NULL WHERE collected_by = ANY(v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'egg_sales' AND column_name = 'sold_by') THEN
    UPDATE egg_sales SET sold_by = NULL WHERE sold_by = ANY(v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'recorded_by') THEN
    UPDATE expenses SET recorded_by = NULL WHERE recorded_by = ANY(v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mortality_logs' AND column_name = 'recorded_by') THEN
    UPDATE mortality_logs SET recorded_by = NULL WHERE recorded_by = ANY(v_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'assigned_to') THEN
    UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ANY(v_ids);
  END IF;

  -- 7) Delete profiles (app-level identity)
  DELETE FROM profiles WHERE id = ANY(v_ids);

  RAISE NOTICE 'Removed app data for Mathias and Diral. Now delete the two users in Supabase Dashboard > Authentication > Users.';
END $$;
