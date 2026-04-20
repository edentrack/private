/*
  URGENT FIX - RESTORE WORKING PROFILES RLS POLICIES
  ====================================================
  
  The super admin migration broke profile access.
  This restores the working policies that allow users to access their own profiles.
*/

-- 1. Fix NULL values first
UPDATE profiles 
SET 
  account_status = COALESCE(account_status, 'active'),
  subscription_tier = COALESCE(subscription_tier, 'free')
WHERE account_status IS NULL OR subscription_tier IS NULL;

-- 2. CRITICAL: Drop ALL profiles policies and recreate the working ones
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON profiles;

-- 3. Restore the WORKING policy: Users can view ALL profiles (needed for app to work)
-- This is the policy that was working before the migration
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- 4. Allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 5. Allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- NOTE: Super admin access should use SECURITY DEFINER functions, not RLS policies
-- This avoids recursion issues
