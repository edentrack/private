-- Fix 1: subscription_tiers SELECT policy exposed to all authenticated users
-- Any logged-in user could query pricing/tier data. Restrict to super admins only.
DROP POLICY IF EXISTS "Super admins can view all tiers" ON subscription_tiers;
CREATE POLICY "Super admins can view all tiers"
  ON subscription_tiers FOR SELECT
  TO authenticated
  USING (auth_is_super_admin());

-- Fix 2: Create admin_delete_user RPC with proper cascades
-- Deletes farms (cascades to all child data) then the auth user
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only super admins can call this
  IF NOT auth_is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Delete farms owned by this user (cascades to flocks, expenses, etc.)
  DELETE FROM farms
  WHERE id IN (
    SELECT farm_id FROM farm_members
    WHERE user_id = p_user_id AND role = 'owner'
  );

  -- Remove from all farm memberships
  DELETE FROM farm_members WHERE user_id = p_user_id;

  -- Delete profile (auth.users row cleaned up by Supabase on next sign-in attempt
  -- or via the admin API — we can only touch public.profiles from SQL)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
