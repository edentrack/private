/*
  # Fix Team "Unknown / Unknown" Display Issue

  1. Changes
    - Change team_activity_log foreign keys to reference profiles instead of auth.users
    - Create RPC function to get activity logs with proper user information
    - Ensure get_farm_members_with_emails returns email from auth.users as fallback
    - Add indexes for better performance

  2. Notes
    - This ensures actor and target information is always available
    - Profiles are created automatically on signup via handle_new_user trigger
    - Email fallback ensures we always show user info
*/

-- Drop existing foreign key constraints on team_activity_log
ALTER TABLE team_activity_log
  DROP CONSTRAINT IF EXISTS team_activity_log_actor_user_id_fkey,
  DROP CONSTRAINT IF EXISTS team_activity_log_target_user_id_fkey;

-- Add new foreign key constraints to profiles instead
ALTER TABLE team_activity_log
  ADD CONSTRAINT team_activity_log_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE team_activity_log
  ADD CONSTRAINT team_activity_log_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Create indexes for better join performance
CREATE INDEX IF NOT EXISTS idx_team_activity_log_actor_user_id ON team_activity_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_log_target_user_id ON team_activity_log(target_user_id);

-- Update get_farm_members_with_emails to get email from auth.users as fallback
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
    COALESCE(p.email, au.email) as email,
    COALESCE(p.full_name, split_part(COALESCE(p.email, au.email), '@', 1)) as full_name
  FROM farm_members fm
  LEFT JOIN profiles p ON p.id = fm.user_id
  LEFT JOIN auth.users au ON au.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
  ORDER BY fm.created_at DESC;
END;
$$;

-- Create function to get team activity logs with proper user information
CREATE OR REPLACE FUNCTION get_team_activity_logs(
  p_farm_id uuid,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  farm_id uuid,
  event_type text,
  details jsonb,
  created_at timestamptz,
  actor_id uuid,
  actor_full_name text,
  actor_email text,
  target_id uuid,
  target_full_name text,
  target_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is a member of the farm
  IF NOT EXISTS (
    SELECT 1 FROM farm_members fm
    WHERE fm.farm_id = p_farm_id
    AND fm.user_id = auth.uid()
    AND fm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: not a member of this farm';
  END IF;

  RETURN QUERY
  SELECT
    tal.id,
    tal.farm_id,
    tal.event_type,
    tal.details,
    tal.created_at,
    tal.actor_user_id as actor_id,
    COALESCE(actor_p.full_name, split_part(COALESCE(actor_p.email, actor_au.email), '@', 1)) as actor_full_name,
    COALESCE(actor_p.email, actor_au.email) as actor_email,
    tal.target_user_id as target_id,
    COALESCE(target_p.full_name, split_part(COALESCE(target_p.email, target_au.email), '@', 1)) as target_full_name,
    COALESCE(target_p.email, target_au.email) as target_email
  FROM team_activity_log tal
  LEFT JOIN profiles actor_p ON actor_p.id = tal.actor_user_id
  LEFT JOIN auth.users actor_au ON actor_au.id = tal.actor_user_id
  LEFT JOIN profiles target_p ON target_p.id = tal.target_user_id
  LEFT JOIN auth.users target_au ON target_au.id = tal.target_user_id
  WHERE tal.farm_id = p_farm_id
  ORDER BY tal.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_team_activity_logs(uuid, integer, integer) TO authenticated;

-- Create function to count total activity logs for pagination
CREATE OR REPLACE FUNCTION count_team_activity_logs(p_farm_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count bigint;
BEGIN
  -- Check if caller is a member of the farm
  IF NOT EXISTS (
    SELECT 1 FROM farm_members fm
    WHERE fm.farm_id = p_farm_id
    AND fm.user_id = auth.uid()
    AND fm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: not a member of this farm';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM team_activity_log
  WHERE farm_id = p_farm_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION count_team_activity_logs(uuid) TO authenticated;