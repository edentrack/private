/*
  # Create Team Invitation RPC Functions

  1. New Functions
    - `invite_team_member(farm_id, email, role)` - Create an invitation for a new team member
    - `accept_pending_invitations()` - Auto-accept all pending invitations for the logged-in user

  2. Security
    - Only farm owners can send invitations
    - Invitations are automatically accepted when user signs in/up
    - Duplicate invitations update the role and invited_by fields

  3. Important Notes
    - `invite_team_member` uses upsert logic to update existing invitations
    - `accept_pending_invitations` adds users to farms and marks invitations as accepted
    - Activity logs are created when invitations are accepted
*/

-- Function to invite a team member
CREATE OR REPLACE FUNCTION public.invite_team_member(
  p_farm_id uuid,
  p_email text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_existing_user_id uuid;
BEGIN
  -- Validate role
  IF p_role NOT IN ('owner', 'manager', 'worker', 'viewer') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid role. Must be owner, manager, worker, or viewer'
    );
  END IF;

  -- Ensure actor is an owner
  IF NOT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id
      AND user_id = v_actor
      AND role = 'owner'
      AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only owners can invite members'
    );
  END IF;

  -- Check if user already exists in the system
  SELECT p.id INTO v_existing_user_id
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = p_email;

  -- If user exists, add them directly instead of creating an invitation
  IF v_existing_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User already exists. Use the add member function instead.',
      'user_exists', true
    );
  END IF;

  -- Create or update invitation
  INSERT INTO team_invitations (farm_id, invited_email, role, invited_by)
  VALUES (p_farm_id, p_email, p_role, v_actor)
  ON CONFLICT (farm_id, invited_email) 
  WHERE accepted = false
  DO UPDATE SET 
    role = EXCLUDED.role,
    invited_by = EXCLUDED.invited_by,
    created_at = now();

  -- Log the activity
  INSERT INTO team_activity_log (
    farm_id, actor_user_id, target_user_id, event_type, details
  ) VALUES (
    p_farm_id,
    v_actor,
    NULL,
    'invitation_sent',
    jsonb_build_object(
      'email', p_email,
      'role', p_role
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Invitation sent successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Function to accept pending invitations
CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_invitation record;
  v_accepted_count int := 0;
BEGIN
  -- Get the user's email
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = auth.uid();

  IF v_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User email not found'
    );
  END IF;

  -- Process each pending invitation
  FOR v_invitation IN
    SELECT farm_id, role, invited_by
    FROM team_invitations
    WHERE invited_email = v_email
    AND accepted = false
  LOOP
    -- Add user to the farm
    INSERT INTO farm_members (farm_id, user_id, role, is_active, invited_by, invited_at, joined_at)
    VALUES (v_invitation.farm_id, auth.uid(), v_invitation.role, true, v_invitation.invited_by, now(), now())
    ON CONFLICT (farm_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        is_active = true,
        updated_at = now();

    -- Log the activity
    INSERT INTO team_activity_log (
      farm_id, actor_user_id, target_user_id, event_type, details
    ) VALUES (
      v_invitation.farm_id,
      auth.uid(),
      auth.uid(),
      'invitation_accepted',
      jsonb_build_object(
        'role', v_invitation.role
      )
    );

    v_accepted_count := v_accepted_count + 1;
  END LOOP;

  -- Mark invitations as accepted
  UPDATE team_invitations
  SET accepted = true, accepted_at = now()
  WHERE invited_email = v_email
  AND accepted = false;

  RETURN jsonb_build_object(
    'success', true,
    'accepted_count', v_accepted_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;
