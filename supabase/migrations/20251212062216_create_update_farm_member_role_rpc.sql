/*
  # Create update_farm_member_role RPC Function

  1. New Function
    - `update_farm_member_role` - Allows owners to change a team member's role
    - Takes farm_member_id and new_role as parameters
    - Only owners can update roles
    - Cannot change your own role
    - Logs the activity to team_activity_log
*/

CREATE OR REPLACE FUNCTION update_farm_member_role(
  p_farm_member_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_farm_id uuid;
  v_target_user_id uuid;
  v_old_role text;
  v_caller_role membership_role;
  v_new_role membership_role;
BEGIN
  BEGIN
    v_new_role := p_new_role::membership_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid role. Must be owner, manager, worker, or viewer.'
    );
  END;

  SELECT farm_id, user_id, role INTO v_farm_id, v_target_user_id, v_old_role
  FROM farm_members
  WHERE id = p_farm_member_id;

  IF v_farm_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found'
    );
  END IF;

  IF v_target_user_id = v_caller_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You cannot change your own role'
    );
  END IF;

  SELECT role INTO v_caller_role
  FROM farm_members
  WHERE farm_id = v_farm_id AND user_id = v_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: only owners can change member roles'
    );
  END IF;

  UPDATE farm_members
  SET role = v_new_role, updated_at = now()
  WHERE id = p_farm_member_id;

  INSERT INTO team_activity_log (farm_id, actor_user_id, target_user_id, event_type, details)
  VALUES (v_farm_id, v_caller_id, v_target_user_id, 'role_changed', 
          jsonb_build_object('old_role', v_old_role, 'new_role', p_new_role));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Role updated successfully'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
