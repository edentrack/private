/*
  # Fix add_or_update_farm_member to Use is_active Column

  1. Changes
    - Replace 'status' references with 'is_active' boolean column
    - The farm_members table uses is_active (boolean) not status (text)
*/

CREATE OR REPLACE FUNCTION add_or_update_farm_member(
  p_farm_id uuid,
  p_member_email text,
  p_role text DEFAULT 'worker'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id uuid;
  v_existing_member_id uuid;
  v_caller_id uuid := auth.uid();
  v_caller_role membership_role;
  v_new_role membership_role;
  v_result jsonb;
BEGIN
  BEGIN
    v_new_role := p_role::membership_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid role. Must be owner, manager, or worker.'
    );
  END;

  SELECT role INTO v_caller_role
  FROM farm_members
  WHERE farm_id = p_farm_id AND user_id = v_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: only owners and managers can add members'
    );
  END IF;

  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE email = p_member_email;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found with this email. They must sign up first.'
    );
  END IF;

  SELECT id INTO v_existing_member_id
  FROM farm_members
  WHERE farm_id = p_farm_id AND user_id = v_target_user_id;

  IF v_existing_member_id IS NOT NULL THEN
    UPDATE farm_members
    SET role = v_new_role, is_active = true, updated_at = now()
    WHERE id = v_existing_member_id;

    INSERT INTO team_activity_log (farm_id, actor_user_id, target_user_id, event_type, details)
    VALUES (p_farm_id, v_caller_id, v_target_user_id, 'role_changed', 
            jsonb_build_object('new_role', p_role));

    v_result := jsonb_build_object(
      'success', true,
      'message', 'Member role updated successfully',
      'member_id', v_existing_member_id
    );
  ELSE
    INSERT INTO farm_members (farm_id, user_id, role, is_active, joined_at, invited_by)
    VALUES (p_farm_id, v_target_user_id, v_new_role, true, now(), v_caller_id)
    RETURNING id INTO v_existing_member_id;

    INSERT INTO team_activity_log (farm_id, actor_user_id, target_user_id, event_type, details)
    VALUES (p_farm_id, v_caller_id, v_target_user_id, 'member_added', 
            jsonb_build_object('role', p_role));

    v_result := jsonb_build_object(
      'success', true,
      'message', 'Member added successfully',
      'member_id', v_existing_member_id
    );
  END IF;

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
