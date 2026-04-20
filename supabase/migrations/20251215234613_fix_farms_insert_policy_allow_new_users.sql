/*
  # Fix Farms INSERT Policy - Allow New Users to Create Farms

  ## Problem
  New users cannot create farms because there's no INSERT policy on the farms table.
  This blocks the automatic farm creation in AuthContext.

  ## Solution
  Add an INSERT policy that allows authenticated users to create farms where they are the owner.

  ## Security
  - Users can only insert farms where they set themselves as owner
  - This matches the auth.uid() check
*/

-- Drop existing INSERT policy if any
DROP POLICY IF EXISTS "Users can create their own farm" ON farms;

-- Allow authenticated users to create farms where they are the owner
CREATE POLICY "Users can create their own farm"
  ON farms FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Also allow first-time farm_member insertion for new farm owners
DROP POLICY IF EXISTS "Users can create initial farm membership" ON farm_members;

CREATE POLICY "Users can create initial farm membership"
  ON farm_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND 
    role = 'owner' AND
    NOT EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farm_members.farm_id
    )
  );
