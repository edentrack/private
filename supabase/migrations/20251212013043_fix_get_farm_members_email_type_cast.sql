/*
  # Fix get_farm_members_with_emails Type Mismatch

  1. Changes
    - Cast auth.users.email from VARCHAR(255) to TEXT to match function return type
    
  2. Security
    - No changes to security policies
*/

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
DECLARE
  v_user_farm_id uuid;
BEGIN
  -- Get the current user's farm_id directly (with RLS off we can access profiles)
  SET LOCAL row_security = off;
  
  SELECT profiles.farm_id INTO v_user_farm_id
  FROM profiles
  WHERE profiles.id = auth.uid();
  
  -- Check if user is requesting their own farm
  IF v_user_farm_id IS NULL OR v_user_farm_id != p_farm_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Return all members with emails (RLS is off in this function context)
  -- CAST email to text to match return type
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
    u.email::text
  FROM farm_members fm
  JOIN profiles p ON p.id = fm.user_id
  LEFT JOIN auth.users u ON u.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
  ORDER BY fm.created_at ASC;
END;
$$;
