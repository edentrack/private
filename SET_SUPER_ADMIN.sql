-- ================================================================
-- EDENTRACK Super Admin Setup
-- ================================================================
-- Run this SQL in Supabase SQL Editor to activate super admin
-- Email: edentrack.app@gmail.com
-- ================================================================

-- Set edentrack.app@gmail.com as super admin
UPDATE profiles
SET
  is_super_admin = true,
  account_status = 'active'
WHERE email = 'edentrack.app@gmail.com';

-- Verify the update
SELECT
  id,
  email,
  full_name,
  is_super_admin,
  account_status,
  subscription_tier,
  created_at
FROM profiles
WHERE email = 'edentrack.app@gmail.com';

-- ================================================================
-- After running this:
-- 1. Make sure you see is_super_admin = true in the results
-- 2. Navigate to your app URL and add: #/super-admin
-- 3. You should see the Super Admin Dashboard
-- ================================================================
