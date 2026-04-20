/*
  # Create Farm Members and Team Management System

  1. New Tables
    - `farm_members`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `user_id` (uuid, references profiles)
      - `role` (text, check constraint for valid roles)
      - `is_active` (boolean, default true)
      - `invited_by` (uuid, references profiles)
      - `invited_at` (timestamptz)
      - `joined_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `farm_members` table
    - Add policy for farm owners/managers to view all members
    - Add policy for members to view their own membership
    - Add policy for farm owners to manage members

  3. Functions
    - `add_or_update_farm_member(farm_id, member_email, new_role)` - Add or update a farm member
    - `get_user_farms()` - Get all farms a user is a member of
    - `is_farm_owner(farm_id)` - Check if current user is owner of a farm

  4. Data Migration
    - Automatically create farm_member records for existing farm owners
*/

-- Create farm_members table
CREATE TABLE IF NOT EXISTS farm_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'worker', 'viewer')),
  is_active boolean DEFAULT true,
  invited_by uuid REFERENCES profiles(id),
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(farm_id, user_id)
);

-- Enable RLS
ALTER TABLE farm_members ENABLE ROW LEVEL SECURITY;

-- Policy: Farm members can view all members of their farm
CREATE POLICY "Farm members can view members of their farm"
  ON farm_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farm_members.farm_id
      AND fm.user_id = auth.uid()
      AND fm.is_active = true
    )
  );

-- Policy: Farm owners can insert members
CREATE POLICY "Farm owners can add members"
  ON farm_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farm_members.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role = 'owner'
      AND fm.is_active = true
    )
  );

-- Policy: Farm owners can update members
CREATE POLICY "Farm owners can update members"
  ON farm_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farm_members.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role = 'owner'
      AND fm.is_active = true
    )
  );

-- Policy: Farm owners can delete members
CREATE POLICY "Farm owners can delete members"
  ON farm_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = farm_members.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role = 'owner'
      AND fm.is_active = true
    )
  );

-- Function to check if user is farm owner
CREATE OR REPLACE FUNCTION is_farm_owner(p_farm_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id
    AND user_id = auth.uid()
    AND role = 'owner'
    AND is_active = true
  );
END;
$$;

-- Function to add or update farm member
CREATE OR REPLACE FUNCTION add_or_update_farm_member(
  p_farm_id uuid,
  p_member_email text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_user_id uuid;
  v_member_record farm_members;
  v_is_owner boolean;
BEGIN
  -- Check if current user is owner of the farm
  SELECT is_farm_owner(p_farm_id) INTO v_is_owner;
  
  IF NOT v_is_owner THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only farm owners can manage members'
    );
  END IF;

  -- Validate role
  IF p_role NOT IN ('owner', 'manager', 'worker', 'viewer') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid role. Must be owner, manager, worker, or viewer'
    );
  END IF;

  -- Find user by email (check both auth.users and profiles)
  SELECT p.id INTO v_member_user_id
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = p_member_email;

  IF v_member_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User with email ' || p_member_email || ' not found. They must create an account first.'
    );
  END IF;

  -- Check if member already exists
  SELECT * INTO v_member_record
  FROM farm_members
  WHERE farm_id = p_farm_id
  AND user_id = v_member_user_id;

  IF v_member_record.id IS NOT NULL THEN
    -- Update existing member
    UPDATE farm_members
    SET role = p_role,
        is_active = true,
        updated_at = now()
    WHERE id = v_member_record.id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Member role updated successfully',
      'member_id', v_member_record.id
    );
  ELSE
    -- Insert new member
    INSERT INTO farm_members (farm_id, user_id, role, invited_by, invited_at, joined_at)
    VALUES (p_farm_id, v_member_user_id, p_role, auth.uid(), now(), now())
    RETURNING id INTO v_member_record;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Member added successfully',
      'member_id', v_member_record.id
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Function to get all farms a user is a member of
CREATE OR REPLACE FUNCTION get_user_farms()
RETURNS TABLE (
  farm_id uuid,
  farm_name text,
  role text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id,
    f.name,
    fm.role,
    fm.is_active
  FROM farm_members fm
  JOIN farms f ON f.id = fm.farm_id
  WHERE fm.user_id = auth.uid()
  AND fm.is_active = true
  ORDER BY f.name;
END;
$$;

-- Migrate existing farm owners to farm_members
INSERT INTO farm_members (farm_id, user_id, role, invited_by, invited_at, joined_at)
SELECT 
  f.id,
  f.owner_id,
  'owner',
  f.owner_id,
  f.created_at,
  f.created_at
FROM farms f
WHERE NOT EXISTS (
  SELECT 1 FROM farm_members fm
  WHERE fm.farm_id = f.id
  AND fm.user_id = f.owner_id
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_farm_members_farm_id ON farm_members(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_members_user_id ON farm_members(user_id);
CREATE INDEX IF NOT EXISTS idx_farm_members_farm_user ON farm_members(farm_id, user_id);
