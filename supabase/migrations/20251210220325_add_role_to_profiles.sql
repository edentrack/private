/*
  # Add Role Field to Profiles

  1. Schema Changes
    - Add `role` field to `profiles` table:
      - `role` (enum: owner, manager, worker)
      - Defaults to 'owner' for existing users
  
  2. Purpose
    - Enables role-based access control
    - Owner: Full access including costs and financial data
    - Manager: Full access including costs and financial data
    - Worker: Limited access, can see quantities but not costs
  
  3. Security
    - Maintains existing RLS policies on profiles
    - No additional policies needed
*/

-- Create enum type for user roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'manager', 'worker');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add role field to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role user_role DEFAULT 'owner';
  END IF;
END $$;

-- Set existing users to owner role
UPDATE profiles SET role = 'owner' WHERE role IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.role IS 'User role: owner (full access), manager (full access), worker (limited access - no costs)';
