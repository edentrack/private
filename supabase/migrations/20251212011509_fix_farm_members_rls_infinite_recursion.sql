/*
  # Fix Farm Members RLS Infinite Recursion

  1. Changes
    - Drop existing recursive policies on farm_members
    - Create new policies that avoid infinite recursion by using helper functions
    - Add a security definer function to check farm membership without recursion

  2. Security
    - Maintains proper access control without circular dependencies
    - Uses security definer functions to break the recursion chain
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Farm members can view members of their farm" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can add members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can update members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can delete members" ON farm_members;

-- Create a helper function to check farm membership without causing recursion
CREATE OR REPLACE FUNCTION user_is_farm_member(p_farm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id
    AND user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Create a helper function to check if user is farm owner without causing recursion
CREATE OR REPLACE FUNCTION user_is_farm_owner_simple(p_farm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id
    AND user_id = auth.uid()
    AND role = 'owner'
    AND is_active = true
  );
$$;

-- Policy: Farm members can view members of their farm
CREATE POLICY "Farm members can view members of their farm"
  ON farm_members FOR SELECT
  TO authenticated
  USING (user_is_farm_member(farm_id));

-- Policy: Farm owners can insert members
CREATE POLICY "Farm owners can add members"
  ON farm_members FOR INSERT
  TO authenticated
  WITH CHECK (user_is_farm_owner_simple(farm_id));

-- Policy: Farm owners can update members
CREATE POLICY "Farm owners can update members"
  ON farm_members FOR UPDATE
  TO authenticated
  USING (user_is_farm_owner_simple(farm_id))
  WITH CHECK (user_is_farm_owner_simple(farm_id));

-- Policy: Farm owners can delete members
CREATE POLICY "Farm owners can delete members"
  ON farm_members FOR DELETE
  TO authenticated
  USING (user_is_farm_owner_simple(farm_id));
