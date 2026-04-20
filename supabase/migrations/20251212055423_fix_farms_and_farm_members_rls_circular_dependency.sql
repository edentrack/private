/*
  # Fix Farms and Farm Members RLS Circular Dependency

  1. Changes
    - Add separate INSERT policy for farms that allows users to create new farms
    - Add comprehensive RLS policies for farm_members table
    - Fix circular dependency where farms INSERT requires farm_members entry

  2. Security
    - Users can create new farms (for signup)
    - Users can only insert themselves as farm members
    - Users can only view/update farm_members where they have access
    - Farm owners can manage their farm members

  Note: The issue is that farms INSERT policy checks farm_members, 
        but farm_members doesn't exist yet during signup
*/

-- Drop existing farm policies that cause circular dependency
DROP POLICY IF EXISTS "Allow users to manage their own farms" ON farms;
DROP POLICY IF EXISTS "Allow users to read their own farms" ON farms;

-- Create new farms policies
CREATE POLICY "Users can insert new farms"
  ON farms
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their farms"
  ON farms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farms.id 
        AND fm.user_id = auth.uid()
        AND fm.is_active = true
    )
  );

CREATE POLICY "Farm owners can update their farms"
  ON farms
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farms.id 
        AND fm.user_id = auth.uid()
        AND fm.role IN ('owner', 'manager')
        AND fm.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farms.id 
        AND fm.user_id = auth.uid()
        AND fm.role IN ('owner', 'manager')
        AND fm.is_active = true
    )
  );

CREATE POLICY "Farm owners can delete their farms"
  ON farms
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farms.id 
        AND fm.user_id = auth.uid()
        AND fm.role = 'owner'
        AND fm.is_active = true
    )
  );

-- Create farm_members RLS policies
DROP POLICY IF EXISTS "Users can insert themselves as farm members" ON farm_members;
DROP POLICY IF EXISTS "Users can view farm members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can manage members" ON farm_members;

CREATE POLICY "Users can insert themselves as farm members"
  ON farm_members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their farm members"
  ON farm_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Farm owners can update members"
  ON farm_members
  FOR UPDATE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager')
        AND is_active = true
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager')
        AND is_active = true
    )
  );

CREATE POLICY "Farm owners can delete members"
  ON farm_members
  FOR DELETE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() 
        AND role = 'owner'
        AND is_active = true
    )
  );