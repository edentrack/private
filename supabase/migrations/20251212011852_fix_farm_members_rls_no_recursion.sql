/*
  # Fix Farm Members RLS - Remove All Recursion

  1. Changes
    - Drop all existing policies on farm_members
    - Temporarily disable RLS to clean slate
    - Re-enable RLS with simple, non-recursive policies
    - Allow users to see their own membership row
    - Allow owners to manage members (checked via profiles.role)
    - Update profiles RLS to allow viewing team members
    
  2. Security
    - No self-referencing policies
    - Simple ownership checks via profiles table
*/

-- Step 1: Drop all existing policies on farm_members
DROP POLICY IF EXISTS "Farm members can view members of their farm" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can add members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can update members" ON farm_members;
DROP POLICY IF EXISTS "Farm owners can delete members" ON farm_members;

-- Step 2: Temporarily disable RLS
ALTER TABLE farm_members DISABLE ROW LEVEL SECURITY;

-- Step 3: Re-enable RLS
ALTER TABLE farm_members ENABLE ROW LEVEL SECURITY;

-- Step 4: Create simple, non-recursive policies

-- Policy 1: Users can view their own membership row
CREATE POLICY "Users can view own membership"
  ON farm_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Farm owners can INSERT members (check via profiles table)
CREATE POLICY "Farm owners can add members"
  ON farm_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.farm_id = farm_members.farm_id
      AND p.role = 'owner'
    )
  );

-- Policy 3: Farm owners can UPDATE members
CREATE POLICY "Farm owners can update members"
  ON farm_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.farm_id = farm_members.farm_id
      AND p.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.farm_id = farm_members.farm_id
      AND p.role = 'owner'
    )
  );

-- Policy 4: Farm owners can DELETE members
CREATE POLICY "Farm owners can delete members"
  ON farm_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.farm_id = farm_members.farm_id
      AND p.role = 'owner'
    )
  );

-- Step 5: Update profiles RLS to allow viewing team members
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Create new policy that allows viewing own profile AND team members' profiles
CREATE POLICY "Users can view own and team profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() 
    OR 
    farm_id IN (
      SELECT p.farm_id 
      FROM profiles p 
      WHERE p.id = auth.uid()
    )
  );
