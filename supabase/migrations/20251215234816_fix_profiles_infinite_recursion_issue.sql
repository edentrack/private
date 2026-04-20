/*
  # Fix Profiles Infinite Recursion

  ## Problem
  The super admin policies on profiles table cause infinite recursion:
  - "Super admins can view all profiles" checks profiles.is_super_admin while querying profiles
  - This creates an infinite loop

  ## Solution
  - Drop the recursive super admin policies
  - Restore simple, non-recursive policies
  - Use SECURITY DEFINER function for super admin checks instead

  ## Security
  - Users can view all profiles (needed for team lookups)
  - Users can only insert/update their own profile
  - Super admin functions use SECURITY DEFINER to bypass RLS
*/

-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON profiles;

-- Drop existing simple policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Restore simple, non-recursive policies
-- Allow all authenticated users to view all profiles (needed for team member lookups)
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create SECURITY DEFINER function for super admin updates
CREATE OR REPLACE FUNCTION update_user_profile_as_admin(
  target_user_id uuid,
  new_account_status text DEFAULT NULL,
  new_subscription_tier text DEFAULT NULL,
  new_subscription_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Check if caller is super admin (bypasses RLS due to SECURITY DEFINER)
  SELECT is_super_admin INTO v_is_admin
  FROM profiles
  WHERE id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Update the target user profile
  UPDATE profiles
  SET
    account_status = COALESCE(new_account_status, account_status),
    subscription_tier = COALESCE(new_subscription_tier, subscription_tier),
    subscription_expires_at = COALESCE(new_subscription_expires_at, subscription_expires_at),
    approved_by = CASE WHEN new_account_status = 'active' THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN new_account_status = 'active' THEN NOW() ELSE approved_at END
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
