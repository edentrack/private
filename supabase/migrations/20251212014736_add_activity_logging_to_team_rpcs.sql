/*
  # Add Activity Logging to Team Management RPCs

  1. Changes
    - Update `update_farm_member_role()` to log role changes
    - Update `set_farm_member_active()` to log status changes
    - Update `add_or_update_farm_member()` to log member additions/updates

  2. Activity Log Events
    - `role_changed` - When a member's role is updated
    - `status_changed` - When a member is activated/deactivated
    - `member_added` - When a new member is added
    - `member_updated` - When an existing member's role is updated
*/

-- Update function to update farm member role with activity logging
CREATE OR REPLACE FUNCTION public.update_farm_member_role(
  p_farm_member_id uuid,
  p_new_role text
) 
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_id uuid;
  v_user_id uuid;
  v_old_role text;
BEGIN
  -- Find member's farm, user_id, and current role
  SELECT farm_id, user_id, role
  INTO v_farm_id, v_user_id, v_old_role
  FROM farm_members
  WHERE id = p_farm_member_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'Farm member not found';
  END IF;

  -- Validate role
  IF p_new_role NOT IN ('owner', 'manager', 'worker', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role. Must be owner, manager, worker, or viewer';
  END IF;

  -- Only owners of that farm can change roles
  IF NOT EXISTS (
    SELECT 1
    FROM farm_members
    WHERE farm_id = v_farm_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only farm owners can change roles';
  END IF;

  -- Update the role
  UPDATE farm_members
  SET 
    role = p_new_role,
    updated_at = now()
  WHERE id = p_farm_member_id;

  -- Log the activity
  INSERT INTO team_activity_log (
    farm_id, actor_user_id, target_user_id, event_type, details
  ) VALUES (
    v_farm_id,
    auth.uid(),
    v_user_id,
    'role_changed',
    jsonb_build_object(
      'old_role', v_old_role,
      'new_role', p_new_role
    )
  );
END;
$$;

-- Update function to set farm member active status with activity logging
CREATE OR REPLACE FUNCTION public.set_farm_member_active(
  p_farm_member_id uuid,
  p_is_active boolean
) 
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_id uuid;
  v_user_id uuid;
BEGIN
  -- Find member's farm and user_id
  SELECT farm_id, user_id
  INTO v_farm_id, v_user_id
  FROM farm_members
  WHERE id = p_farm_member_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'Farm member not found';
  END IF;

  -- Prevent user from changing their own active status
  IF v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own active status';
  END IF;

  -- Ensure caller is an owner
  IF NOT EXISTS (
    SELECT 1
    FROM farm_members
    WHERE farm_id = v_farm_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only farm owners can change member status';
  END IF;

  -- Update the active status
  UPDATE farm_members
  SET 
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_farm_member_id;

  -- Log the activity
  INSERT INTO team_activity_log (
    farm_id, actor_user_id, target_user_id, event_type, details
  ) VALUES (
    v_farm_id,
    auth.uid(),
    v_user_id,
    'status_changed',
    jsonb_build_object(
      'is_active', p_is_active
    )
  );
END;
$$;

-- Update function to add or update farm member with activity logging
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
  v_is_new_member boolean;
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
    v_is_new_member := false;
    
    UPDATE farm_members
    SET role = p_role,
        is_active = true,
        updated_at = now()
    WHERE id = v_member_record.id;

    -- Log the activity
    INSERT INTO team_activity_log (
      farm_id, actor_user_id, target_user_id, event_type, details
    ) VALUES (
      p_farm_id,
      auth.uid(),
      v_member_user_id,
      'member_updated',
      jsonb_build_object(
        'role', p_role,
        'email', p_member_email
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Member role updated successfully',
      'member_id', v_member_record.id
    );
  ELSE
    -- Insert new member
    v_is_new_member := true;
    
    INSERT INTO farm_members (farm_id, user_id, role, invited_by, invited_at, joined_at)
    VALUES (p_farm_id, v_member_user_id, p_role, auth.uid(), now(), now())
    RETURNING id INTO v_member_record;

    -- Log the activity
    INSERT INTO team_activity_log (
      farm_id, actor_user_id, target_user_id, event_type, details
    ) VALUES (
      p_farm_id,
      auth.uid(),
      v_member_user_id,
      'member_added',
      jsonb_build_object(
        'role', p_role,
        'email', p_member_email
      )
    );

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
