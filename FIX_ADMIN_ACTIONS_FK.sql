/*
  FIX ADMIN_ACTIONS FOREIGN KEY CONSTRAINT
  =========================================
  
  Problem: admin_actions.target_user_id has a foreign key that prevents
  deleting users when they're referenced in admin_actions.
  
  Solution: Make the foreign key nullable and allow SET NULL on delete.
*/

-- First, drop the existing foreign key constraint
ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_target_user_id_fkey;

-- Recreate it with ON DELETE SET NULL so deleted users don't block deletion
ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_target_user_id_fkey
  FOREIGN KEY (target_user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

-- Now update the delete function to work properly
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  -- Log the action BEFORE deleting (with user ID)
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'delete_user',
    p_user_id,
    jsonb_build_object(
      'deleted_at', NOW(),
      'deleted_user_email', (SELECT email FROM profiles WHERE id = p_user_id)
    )
  );

  -- Delete the profile (cascades to farms, flocks, etc.)
  -- The admin_actions.target_user_id will be set to NULL automatically
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
