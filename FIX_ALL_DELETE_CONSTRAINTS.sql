/*
  FIX ALL FOREIGN KEY CONSTRAINTS FOR USER DELETION
  ===================================================
  
  This fixes ALL foreign key constraints that prevent deleting users.
  Sets appropriate ON DELETE behavior for all tables that reference profiles.
*/

-- 1. Fix admin_actions foreign key
ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_target_user_id_fkey;

ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_target_user_id_fkey
  FOREIGN KEY (target_user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

-- 2. Fix team_activity_log foreign keys (drop ALL possible constraint names)
-- Use DO block to drop any constraint that references profiles
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name = 'team_activity_log' 
    AND constraint_type = 'FOREIGN KEY'
    AND (constraint_name LIKE '%actor%' OR constraint_name LIKE '%target%')
  ) LOOP
    EXECUTE 'ALTER TABLE team_activity_log DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

-- Recreate with SET NULL (or CASCADE - depends on if you want to keep activity logs)
-- Using SET NULL so activity logs are preserved but user reference is cleared
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

-- 3. Update admin_delete_user function to handle all constraints
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email text;
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  -- Prevent deleting yourself
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Prevent deleting other super admins
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete super admin accounts';
  END IF;

  -- Get user email before deleting (for logging)
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

  -- Delete the profile
  -- All foreign keys should now allow this (SET NULL or CASCADE)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
