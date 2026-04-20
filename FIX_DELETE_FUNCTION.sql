/*
  FIX DELETE USER FUNCTION
  ========================
  
  This fixes the foreign key constraint error when deleting users.
  The issue: We were trying to log after deleting, but the foreign key
  references the deleted user. Solution: Log BEFORE deleting.
*/

-- Fix the admin_delete_user function to log before deleting
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

  -- Log the action BEFORE deleting (so we can reference the user)
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'delete_user',
    p_user_id,
    jsonb_build_object('deleted_at', NOW())
  );

  -- Delete the profile (cascades to farms, flocks, etc. due to ON DELETE CASCADE)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
