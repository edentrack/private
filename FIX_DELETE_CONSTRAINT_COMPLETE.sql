/*
  COMPLETE FIX FOR USER DELETION FOREIGN KEY CONSTRAINTS
  ========================================================
  
  This fixes ALL foreign key constraints that prevent deleting users.
  The error specifically mentions: team_activity_log_target_profiles_fkey
*/

-- 1. Fix admin_actions foreign key
ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_target_user_id_fkey;

ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_target_user_id_fkey
  FOREIGN KEY (target_user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

-- 2. Fix team_activity_log foreign keys - DROP ALL POSSIBLE CONSTRAINT NAMES
-- The error shows: team_activity_log_target_profiles_fkey
ALTER TABLE team_activity_log
  DROP CONSTRAINT IF EXISTS team_activity_log_actor_user_id_fkey,
  DROP CONSTRAINT IF EXISTS team_activity_log_target_user_id_fkey,
  DROP CONSTRAINT IF EXISTS team_activity_log_target_profiles_fkey,
  DROP CONSTRAINT IF EXISTS team_activity_log_actor_profiles_fkey;

-- Use DO block to find and drop ANY foreign key that references profiles
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name 
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'team_activity_log'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'profiles'
  ) LOOP
    EXECUTE 'ALTER TABLE team_activity_log DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

-- Recreate with SET NULL so activity logs are preserved
ALTER TABLE team_activity_log
  ADD CONSTRAINT team_activity_log_actor_user_id_fkey
  FOREIGN KEY (actor_user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

ALTER TABLE team_activity_log
  ADD CONSTRAINT team_activity_log_target_user_id_fkey
  FOREIGN KEY (target_user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

-- 3. Update admin_delete_user function
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email text;
BEGIN
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete super admin accounts';
  END IF;

  -- Get user email before deleting
  SELECT email INTO v_user_email FROM profiles WHERE id = p_user_id;

  -- Log the action BEFORE deleting
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'delete_user',
    p_user_id,
    jsonb_build_object(
      'deleted_at', NOW(),
      'deleted_user_email', v_user_email
    )
  );

  -- Delete the profile (foreign keys will set to NULL automatically)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
