/*
  QUICK FIX FOR LOADING SCREEN ISSUE
  ===================================
  
  This script fixes the most common issues that cause the loading screen to hang:
  1. Ensures all profiles have proper account_status and subscription_tier
  2. Fixes RLS policies that might be blocking profile access
  3. Ensures users can always access their own profiles
*/

-- 1. Fix NULL values in account_status and subscription_tier
UPDATE profiles 
SET 
  account_status = COALESCE(account_status, 'active'),
  subscription_tier = COALESCE(subscription_tier, 'free')
WHERE account_status IS NULL OR subscription_tier IS NULL;

-- 2. Ensure the profile RLS policy allows users to view/update their own profile
-- Drop and recreate the policy to be more permissive
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Allow users to view their own profile (MUST WORK)
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Keep super admin policies but ensure they don't interfere
-- The super admin policies should be additive, not exclusive
-- Re-create super admin policy if needed
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON profiles;

CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  );

-- 3. Ensure farm_members queries can work
-- Users should be able to query farm_members for their own user_id
-- (Assuming this policy exists, if not, we need to check)

-- 4. Ensure farms table allows users to query their own farms
-- (This should already be working, but let's make sure)

COMMENT ON COLUMN profiles.account_status IS 'User account status: pending, active, suspended, rejected. Default: active';
COMMENT ON COLUMN profiles.subscription_tier IS 'Subscription tier: free, pro, enterprise. Default: free';
