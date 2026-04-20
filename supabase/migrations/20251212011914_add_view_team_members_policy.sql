/*
  # Add Policy to View All Team Members

  1. Changes
    - Add policy to allow users to view all members of their farm
    - This allows the get_farm_members_with_emails function to work
    
  2. Security
    - Users can only see members of farms they belong to
    - No recursion - uses profiles table for farm_id lookup
*/

-- Add policy to view all team members of the same farm
CREATE POLICY "Users can view team members of their farm"
  ON farm_members FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT p.farm_id 
      FROM profiles p 
      WHERE p.id = auth.uid()
    )
  );
