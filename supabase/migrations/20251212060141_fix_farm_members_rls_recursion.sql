/*
  # Fix Farm Members RLS Infinite Recursion

  1. Changes
    - Replace self-referencing policies with simpler direct checks
    - Use security definer function to avoid recursion
    - Fix all farm_members policies to prevent infinite loops

  2. Security
    - Users can view their own memberships
    - Users can view other members in farms they belong to
    - Farm owners/managers can manage members
*/

-- Create helper function to check farm membership without triggering RLS
CREATE OR REPLACE FUNCTION user_has_farm_access(check_farm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = check_farm_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- Create helper function to check if user is farm owner/manager
CREATE OR REPLACE FUNCTION user_is_farm_admin(check_farm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = check_farm_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
      AND is_active = true
  );
$$;

-- Create helper function to check if user is farm owner
CREATE OR REPLACE FUNCTION user_is_farm_owner(check_farm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = check_farm_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  );
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view their farm members" ON farm_members;
DROP POLICY IF EXISTS "Users can insert themselves as farm members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can update members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can delete members" ON farm_members;

-- Create new policies using helper functions
CREATE POLICY "Users can view farm members"
  ON farm_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR user_has_farm_access(farm_id)
  );

CREATE POLICY "Users can insert themselves as members"
  ON farm_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Farm admins can update members"
  ON farm_members
  FOR UPDATE
  TO authenticated
  USING (user_is_farm_admin(farm_id))
  WITH CHECK (user_is_farm_admin(farm_id));

CREATE POLICY "Farm owners can delete members"
  ON farm_members
  FOR DELETE
  TO authenticated
  USING (user_is_farm_owner(farm_id));

-- Also fix farms policies that might have similar issues
DROP POLICY IF EXISTS "Users can view their farms" ON farms;
DROP POLICY IF EXISTS "Farm owners can update their farms" ON farms;
DROP POLICY IF EXISTS "Farm owners can delete their farms" ON farms;

CREATE POLICY "Users can view their farms"
  ON farms
  FOR SELECT
  TO authenticated
  USING (user_has_farm_access(id));

CREATE POLICY "Farm admins can update farms"
  ON farms
  FOR UPDATE
  TO authenticated
  USING (user_is_farm_admin(id))
  WITH CHECK (user_is_farm_admin(id));

CREATE POLICY "Farm owners can delete farms"
  ON farms
  FOR DELETE
  TO authenticated
  USING (user_is_farm_owner(id));