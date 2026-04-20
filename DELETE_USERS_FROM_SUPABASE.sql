/*
  DELETE USERS FROM SUPABASE
  ===========================
  
  This script provides two ways to delete users:
  1. Create a safe admin delete function (recommended)
  2. Direct SQL deletion commands
  
  WARNING: Deletion is PERMANENT and cannot be undone!
*/

-- ============================================================================
-- OPTION 1: CREATE ADMIN DELETE FUNCTION (RECOMMENDED)
-- ============================================================================

-- Create function to safely delete users (super admin only)
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

-- ============================================================================
-- OPTION 2: DIRECT SQL DELETION (Use with caution!)
-- ============================================================================

-- To delete specific users by email, run:
/*
DELETE FROM profiles 
WHERE email IN (
  'mesodeleonela77@gmail.com',
  'uzoma.abanonu@gmail.com',
  'greatcadigwe@gmail.com',
  'athelaw1@gmail.com'
);
*/

-- To delete users by ID:
/*
DELETE FROM profiles 
WHERE id IN (
  'user-uuid-1',
  'user-uuid-2',
  'user-uuid-3'
);
*/

-- To delete a single user:
/*
DELETE FROM profiles WHERE email = 'user@example.com';
*/

-- ============================================================================
-- VERIFY DELETION
-- ============================================================================

-- Check remaining users:
-- SELECT id, email, full_name, account_status FROM profiles ORDER BY created_at DESC;

-- Check if farms were deleted (should be 0 for deleted users):
-- SELECT f.id, f.name, f.owner_id, p.email 
-- FROM farms f
-- LEFT JOIN profiles p ON p.id = f.owner_id 
-- WHERE p.id IS NULL;
