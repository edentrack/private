-- =============================================================================
-- OPTIONAL: List and remove accounts that no longer have any farm (after clean slate)
-- Run this in Supabase SQL Editor AFTER running the migration
-- 20260226100004_clean_slate_remove_other_accounts
-- =============================================================================

-- STEP 1: See which users no longer have any farm membership ("orphan" accounts)
-- Use this list to delete them in Supabase Dashboard > Authentication > Users
SELECT id, email, full_name, created_at
FROM profiles
WHERE id NOT IN (SELECT user_id FROM farm_members)
ORDER BY created_at DESC;

-- STEP 2 (optional): Delete their profiles from public.profiles
-- This allows you to fully remove those accounts from the app database.
-- You still need to delete the auth users in Dashboard > Authentication > Users
-- so they cannot log in anymore.
--
-- Uncomment and run the line below only if you want to delete profiles for
-- users who have no farm membership (e.g. after running the clean slate migration):
--
-- DELETE FROM profiles
-- WHERE id NOT IN (SELECT user_id FROM farm_members);

-- NOTE: If the DELETE above fails with a foreign key error, some table still
-- references these profiles (e.g. recorded_by, invited_by). In that case,
-- delete the auth users in Dashboard > Authentication > Users; they will see
-- "No farm assigned" when logging in until you remove them there.
