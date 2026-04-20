/*
  # Add RLS Policies for User Preferences
  
  1. Security
    - Ensure users can only read their own preferences
    - Ensure users can only insert their own preferences
    - Ensure users can only update their own preferences
    - No delete policy (preferences should persist)
  
  2. Changes
    - Add SELECT policy for authenticated users to read own preferences
    - Add INSERT policy for authenticated users to create own preferences  
    - Add UPDATE policy for authenticated users to update own preferences
*/

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;

-- Allow users to read their own preferences
CREATE POLICY "Users can read own preferences"
  ON user_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow users to insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
