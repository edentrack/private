/*
  # Fix Farm Members Table Missing Columns

  1. Changes
    - Add invited_by, invited_at, joined_at, updated_at columns
    - Update get_farm_members_with_emails function to work with actual schema

  Note: Code expects these columns but they don't exist in the table
*/

-- Add missing columns to farm_members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_members' AND column_name = 'invited_by'
  ) THEN
    ALTER TABLE farm_members ADD COLUMN invited_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_members' AND column_name = 'invited_at'
  ) THEN
    ALTER TABLE farm_members ADD COLUMN invited_at timestamptz DEFAULT now();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_members' AND column_name = 'joined_at'
  ) THEN
    ALTER TABLE farm_members ADD COLUMN joined_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farm_members' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE farm_members ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Update the get_farm_members_with_emails function to match actual columns
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
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fm.id,
    fm.farm_id,
    fm.user_id,
    fm.role::text,
    fm.is_active,
    fm.invited_by,
    fm.invited_at,
    fm.joined_at,
    fm.created_at,
    fm.updated_at,
    p.email,
    p.full_name
  FROM farm_members fm
  LEFT JOIN profiles p ON p.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
  ORDER BY fm.created_at DESC;
END;
$$;