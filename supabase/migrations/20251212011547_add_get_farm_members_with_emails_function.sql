/*
  # Add Function to Get Farm Members With Emails

  1. New Functions
    - `get_farm_members_with_emails(p_farm_id)` - Returns farm members with their email addresses from auth.users
    
  2. Security
    - Uses SECURITY DEFINER to access auth.users table
    - Only returns members for farms where the current user is a member
*/

-- Function to get farm members with their email addresses
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
STABLE
AS $$
BEGIN
  -- Check if current user is a member of this farm
  IF NOT user_is_farm_member(p_farm_id) THEN
    RAISE EXCEPTION 'Access denied: You are not a member of this farm';
  END IF;

  -- Return farm members with their emails
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
    u.email
  FROM farm_members fm
  JOIN profiles p ON p.id = fm.user_id
  LEFT JOIN auth.users u ON u.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
  ORDER BY fm.created_at ASC;
END;
$$;
