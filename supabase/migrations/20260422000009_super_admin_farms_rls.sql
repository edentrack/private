-- Allow super admins to SELECT all farms and farm_members
-- (needed for SuperAdmin dashboard to show farm info for any user)
-- auth_is_super_admin() is a SECURITY DEFINER function from the profiles RLS migration

DROP POLICY IF EXISTS "super_admin_select_all_farms" ON farms;
CREATE POLICY "super_admin_select_all_farms"
  ON farms
  FOR SELECT
  TO authenticated
  USING (auth_is_super_admin());

DROP POLICY IF EXISTS "super_admin_select_all_farm_members" ON farm_members;
CREATE POLICY "super_admin_select_all_farm_members"
  ON farm_members
  FOR SELECT
  TO authenticated
  USING (auth_is_super_admin());
