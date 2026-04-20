/*
  # Completely Simplify Farm Members RLS

  1. Changes
    - Remove all complex helper functions
    - Drop all existing policies
    - Create ultra-simple policies with no self-reference
    - Update get_farm_members_with_emails to not use helper functions
    
  2. Security
    - Zero recursion - direct simple checks only
    - Users see their own row
    - Users with owner role in profiles can manage
*/

-- Drop the helper functions that might cause recursion
DROP FUNCTION IF EXISTS user_is_farm_member(uuid);
DROP FUNCTION IF EXISTS user_is_farm_owner_simple(uuid);

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own membership" ON farm_members;
DROP POLICY IF EXISTS "Users can view team members of their farm" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can add members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can update members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can delete members" ON farm_members;

-- Create the simplest possible policies

-- SELECT: Users can see their own membership row
CREATE POLICY "View own membership"
  ON farm_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT: Only if requester is owner (checked via profiles, no farm_members reference)
CREATE POLICY "Owners can insert members"
  ON farm_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = farm_members.farm_id
      AND profiles.role = 'owner'
    )
  );

-- UPDATE: Only if requester is owner
CREATE POLICY "Owners can update members"
  ON farm_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = farm_members.farm_id
      AND profiles.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = farm_members.farm_id
      AND profiles.role = 'owner'
    )
  );

-- DELETE: Only if requester is owner
CREATE POLICY "Owners can delete members"
  ON farm_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = farm_members.farm_id
      AND profiles.role = 'owner'
    )
  );

-- Recreate get_farm_members_with_emails without helper function
DROP FUNCTION IF EXISTS get_farm_members_with_emails(uuid);

CREATE OR REPLACE FUNCTION get_farm_members_with_emails(p_farm_id uuid)
RETURNS TABLE (
  id uuid,
  farm_id uuid,
  user_id uuid,
  role text,
  is_active boolean,
  invited_by uuid,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  full_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Simple check: is the current user in this farm?
  -- This uses the simple "View own membership" policy - no recursion
  IF NOT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_members.farm_id = p_farm_id
    AND farm_members.user_id = auth.uid()
    AND farm_members.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Return all members with emails
  -- Use SET LOCAL to temporarily disable RLS for this function
  SET LOCAL row_security = off;
  
  RETURN QUERY
  SELECT 
    fm.id,
    fm.farm_id,
    fm.user_id,
    fm.role,
    fm.is_active,
    fm.invited_by,
    fm.invited_at,
    fm.joined_at,
    fm.created_at,
    fm.updated_at,
    p.full_name,
    u.email
  FROM farm_members fm
  JOIN profiles p ON p.id = fm.user_id
  LEFT JOIN auth.users u ON u.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
  ORDER BY fm.created_at ASC;
END;
$$;
