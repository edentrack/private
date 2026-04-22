-- Fix profiles table PII leak
-- Previously: USING (true) — any authenticated user could read every customer's
-- email, subscription tier, and is_super_admin flag.
-- Fix: restrict to own row + same-farm members + super admins only.
--
-- The recursion problem (checking is_super_admin inside a profiles policy
-- queries profiles again → infinite loop) is solved by wrapping the check
-- in a SECURITY DEFINER function that bypasses RLS.

-- Step 1: helper function that reads is_super_admin without triggering RLS
CREATE OR REPLACE FUNCTION auth_is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(is_super_admin, false)
  FROM profiles
  WHERE id = auth.uid();
$$;

-- Step 2: replace the open SELECT policy
-- Wrap farm_members subquery in SECURITY DEFINER to prevent recursion:
-- a plain subquery inherits the caller's RLS context, creating a loop
-- profiles → farm_members RLS → (some path) → profiles
CREATE OR REPLACE FUNCTION get_farm_member_ids_for_user()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT fm_other.user_id
  FROM farm_members fm_me
  JOIN farm_members fm_other ON fm_me.farm_id = fm_other.farm_id
  WHERE fm_me.user_id = auth.uid()
    AND fm_me.is_active = true
    AND fm_other.is_active = true;
$$;

DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;

CREATE POLICY "profiles_select"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR auth_is_super_admin()
    OR id IN (SELECT get_farm_member_ids_for_user())
  );

-- INSERT and UPDATE policies are already correct (auth.uid() = id) — leave them.
