/*
  # Fix Farms INSERT Policy - Final

  ## Problem
  Multiple migrations created conflicting INSERT policies on farms table.
  The current policy may not be allowing farm creation properly.

  ## Solution
  - Drop ALL existing INSERT policies
  - Create a single, clear INSERT policy
  - Allow authenticated users to create farms where they set themselves as owner

  ## Security
  - Users can only create farms where owner_id = auth.uid()
  - This prevents users from creating farms owned by others
*/

-- Drop ALL existing INSERT policies on farms
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can insert new farms" ON farms;
  DROP POLICY IF EXISTS "Users can create their own farm" ON farms;
  DROP POLICY IF EXISTS "Allow farm creation" ON farms;
  DROP POLICY IF EXISTS "Users can create farms" ON farms;
END $$;

-- Create the definitive INSERT policy for farms
CREATE POLICY "Authenticated users can create farms as owner"
  ON farms FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());
