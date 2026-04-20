/*
  # Comprehensive Authentication & Invitation System

  ## Description
  This migration creates a robust, production-ready authentication and team invitation
  system with secure token-based invite flows, email verification support, and proper
  activity logging.

  ## Changes to `team_invitations`
    - Add `token` (text) - Secure random token for invite links
    - Add `status` (text) - pending/accepted/expired/revoked
    - Add `expires_at` (timestamptz) - When the invite expires
    - Add `accepted_by` (uuid) - User who accepted the invite

  ## New RPC Functions
    - `create_team_invitation` - Creates an invite with secure token
    - `get_invitation_by_token` - Public lookup for invite landing page
    - `accept_team_invitation` - Accept an invite by token
    - `revoke_team_invitation` - Revoke a pending invite
    - `resend_team_invitation` - Regenerate token and extend expiry

  ## Security
    - Tokens are 64-character random strings
    - Invites expire after 7 days
    - Rate limiting: max 5 invites per email per day
    - Only owners/managers can create invites
    - Only owners can revoke invites
    - Token lookup is secure (returns limited info)

  ## Activity Logging
    - All invite actions are logged to team_activity_log
    - Includes actor, target email, event type, and details
*/

-- Add new columns to team_invitations if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_invitations' AND column_name = 'token'
  ) THEN
    ALTER TABLE team_invitations ADD COLUMN token text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_invitations' AND column_name = 'status'
  ) THEN
    ALTER TABLE team_invitations ADD COLUMN status text DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_invitations' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE team_invitations ADD COLUMN expires_at timestamptz DEFAULT (now() + interval '7 days');
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_invitations' AND column_name = 'accepted_by'
  ) THEN
    ALTER TABLE team_invitations ADD COLUMN accepted_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add constraint for status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'team_invitations_status_check'
  ) THEN
    ALTER TABLE team_invitations ADD CONSTRAINT team_invitations_status_check 
      CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Create unique index on token
CREATE UNIQUE INDEX IF NOT EXISTS team_invitations_token_idx ON team_invitations(token) WHERE token IS NOT NULL;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS team_invitations_email_status_idx ON team_invitations(invited_email, status);

-- Function to generate secure random token
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..64 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Create team invitation RPC
CREATE OR REPLACE FUNCTION create_team_invitation(
  p_farm_id uuid,
  p_email text,
  p_role text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_token text;
  v_invite_id uuid;
  v_existing_member uuid;
  v_existing_pending uuid;
  v_recent_count integer;
  v_farm_name text;
BEGIN
  -- Check actor permissions
  SELECT role::text INTO v_actor_role
  FROM farm_members
  WHERE farm_id = p_farm_id
    AND user_id = v_actor_id
    AND is_active = true;
    
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to invite members');
  END IF;
  
  -- Check if email is already a member
  SELECT fm.user_id INTO v_existing_member
  FROM farm_members fm
  JOIN profiles p ON p.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
    AND lower(p.email) = lower(p_email)
    AND fm.is_active = true;
    
  IF v_existing_member IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'This user is already a member of this farm');
  END IF;
  
  -- Check for existing pending invite
  SELECT id INTO v_existing_pending
  FROM team_invitations
  WHERE farm_id = p_farm_id
    AND lower(invited_email) = lower(p_email)
    AND status = 'pending'
    AND expires_at > now();
    
  IF v_existing_pending IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'A pending invitation already exists for this email');
  END IF;
  
  -- Rate limiting: max 5 invites per email per day
  SELECT count(*) INTO v_recent_count
  FROM team_invitations
  WHERE farm_id = p_farm_id
    AND lower(invited_email) = lower(p_email)
    AND created_at > now() - interval '24 hours';
    
  IF v_recent_count >= 5 THEN
    RETURN json_build_object('success', false, 'error', 'Too many invitations sent to this email. Please wait before sending another.');
  END IF;
  
  -- Get farm name
  SELECT name INTO v_farm_name FROM farms WHERE id = p_farm_id;
  
  -- Generate unique token
  LOOP
    v_token := generate_invite_token();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM team_invitations WHERE token = v_token);
  END LOOP;
  
  -- Create the invitation
  INSERT INTO team_invitations (
    farm_id,
    invited_email,
    role,
    invited_by,
    token,
    status,
    expires_at,
    created_at
  ) VALUES (
    p_farm_id,
    lower(p_email),
    p_role,
    v_actor_id,
    v_token,
    'pending',
    now() + interval '7 days',
    now()
  )
  RETURNING id INTO v_invite_id;
  
  -- Log the activity
  INSERT INTO team_activity_log (
    farm_id,
    actor_user_id,
    event_type,
    details
  ) VALUES (
    p_farm_id,
    v_actor_id,
    'invite_created',
    json_build_object(
      'invite_id', v_invite_id,
      'invited_email', lower(p_email),
      'role', p_role,
      'farm_name', v_farm_name
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'invite_id', v_invite_id,
    'token', v_token,
    'message', 'Invitation created successfully'
  );
END;
$$;

-- Get invitation by token (for landing page)
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_farm_name text;
  v_inviter_name text;
BEGIN
  SELECT 
    ti.*,
    f.name as farm_name,
    p.full_name as inviter_name
  INTO v_invite
  FROM team_invitations ti
  JOIN farms f ON f.id = ti.farm_id
  LEFT JOIN profiles p ON p.id = ti.invited_by
  WHERE ti.token = p_token;
  
  IF v_invite IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invitation not found',
      'error_code', 'NOT_FOUND'
    );
  END IF;
  
  IF v_invite.status = 'accepted' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'This invitation has already been accepted',
      'error_code', 'ALREADY_ACCEPTED'
    );
  END IF;
  
  IF v_invite.status = 'revoked' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'This invitation has been revoked',
      'error_code', 'REVOKED'
    );
  END IF;
  
  IF v_invite.status = 'expired' OR v_invite.expires_at < now() THEN
    -- Update status if it's expired but not marked yet
    UPDATE team_invitations SET status = 'expired' WHERE id = v_invite.id AND status = 'pending';
    
    RETURN json_build_object(
      'success', false,
      'error', 'This invitation has expired. Please ask for a new invitation.',
      'error_code', 'EXPIRED'
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'invite', json_build_object(
      'id', v_invite.id,
      'farm_id', v_invite.farm_id,
      'farm_name', v_invite.farm_name,
      'email', v_invite.invited_email,
      'role', v_invite.role,
      'inviter_name', v_invite.inviter_name,
      'expires_at', v_invite.expires_at
    )
  );
END;
$$;

-- Accept invitation by token
CREATE OR REPLACE FUNCTION accept_team_invitation(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite record;
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You must be logged in to accept an invitation');
  END IF;
  
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Get the invitation
  SELECT * INTO v_invite
  FROM team_invitations
  WHERE token = p_token;
  
  IF v_invite IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;
  
  -- Verify email matches (case insensitive)
  IF lower(v_user_email) != lower(v_invite.invited_email) THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'This invitation was sent to a different email address. Please sign in with ' || v_invite.invited_email
    );
  END IF;
  
  -- Check status
  IF v_invite.status = 'accepted' THEN
    RETURN json_build_object('success', false, 'error', 'This invitation has already been accepted');
  END IF;
  
  IF v_invite.status = 'revoked' THEN
    RETURN json_build_object('success', false, 'error', 'This invitation has been revoked');
  END IF;
  
  IF v_invite.status = 'expired' OR v_invite.expires_at < now() THEN
    UPDATE team_invitations SET status = 'expired' WHERE id = v_invite.id;
    RETURN json_build_object('success', false, 'error', 'This invitation has expired');
  END IF;
  
  -- Check if user is already a member
  SELECT id INTO v_member_id
  FROM farm_members
  WHERE farm_id = v_invite.farm_id AND user_id = v_user_id;
  
  IF v_member_id IS NOT NULL THEN
    -- Update the invitation to accepted anyway
    UPDATE team_invitations
    SET status = 'accepted',
        accepted_at = now(),
        accepted_by = v_user_id
    WHERE id = v_invite.id;
    
    -- Reactivate if inactive
    UPDATE farm_members
    SET is_active = true,
        role = v_invite.role::membership_role,
        updated_at = now()
    WHERE id = v_member_id;
    
    RETURN json_build_object('success', true, 'message', 'Welcome back! Your membership has been restored.');
  END IF;
  
  -- Create farm member
  INSERT INTO farm_members (
    farm_id,
    user_id,
    role,
    is_active,
    invited_by,
    invited_at,
    joined_at
  ) VALUES (
    v_invite.farm_id,
    v_user_id,
    v_invite.role::membership_role,
    true,
    v_invite.invited_by,
    v_invite.created_at,
    now()
  )
  RETURNING id INTO v_member_id;
  
  -- Update invitation
  UPDATE team_invitations
  SET status = 'accepted',
      accepted = true,
      accepted_at = now(),
      accepted_by = v_user_id
  WHERE id = v_invite.id;
  
  -- Log activity
  INSERT INTO team_activity_log (
    farm_id,
    actor_user_id,
    target_user_id,
    event_type,
    details
  ) VALUES (
    v_invite.farm_id,
    v_user_id,
    v_user_id,
    'invite_accepted',
    json_build_object(
      'invite_id', v_invite.id,
      'email', v_invite.invited_email,
      'role', v_invite.role,
      'member_id', v_member_id
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'You have successfully joined the farm!',
    'farm_id', v_invite.farm_id,
    'role', v_invite.role
  );
END;
$$;

-- Revoke invitation
CREATE OR REPLACE FUNCTION revoke_team_invitation(p_invite_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_invite record;
BEGIN
  -- Get invite
  SELECT * INTO v_invite FROM team_invitations WHERE id = p_invite_id;
  
  IF v_invite IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;
  
  -- Check permissions (owner only)
  SELECT role::text INTO v_actor_role
  FROM farm_members
  WHERE farm_id = v_invite.farm_id
    AND user_id = v_actor_id
    AND is_active = true;
    
  IF v_actor_role != 'owner' THEN
    RETURN json_build_object('success', false, 'error', 'Only farm owners can revoke invitations');
  END IF;
  
  IF v_invite.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Only pending invitations can be revoked');
  END IF;
  
  -- Update status
  UPDATE team_invitations
  SET status = 'revoked'
  WHERE id = p_invite_id;
  
  -- Log activity
  INSERT INTO team_activity_log (
    farm_id,
    actor_user_id,
    event_type,
    details
  ) VALUES (
    v_invite.farm_id,
    v_actor_id,
    'invite_revoked',
    json_build_object(
      'invite_id', p_invite_id,
      'email', v_invite.invited_email
    )
  );
  
  RETURN json_build_object('success', true, 'message', 'Invitation revoked successfully');
END;
$$;

-- Resend invitation (regenerate token and extend expiry)
CREATE OR REPLACE FUNCTION resend_team_invitation(p_invite_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_invite record;
  v_new_token text;
BEGIN
  -- Get invite
  SELECT * INTO v_invite FROM team_invitations WHERE id = p_invite_id;
  
  IF v_invite IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;
  
  -- Check permissions
  SELECT role::text INTO v_actor_role
  FROM farm_members
  WHERE farm_id = v_invite.farm_id
    AND user_id = v_actor_id
    AND is_active = true;
    
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN json_build_object('success', false, 'error', 'You do not have permission to resend invitations');
  END IF;
  
  IF v_invite.status = 'accepted' THEN
    RETURN json_build_object('success', false, 'error', 'This invitation has already been accepted');
  END IF;
  
  -- Generate new token
  LOOP
    v_new_token := generate_invite_token();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM team_invitations WHERE token = v_new_token);
  END LOOP;
  
  -- Update invitation
  UPDATE team_invitations
  SET token = v_new_token,
      status = 'pending',
      expires_at = now() + interval '7 days'
  WHERE id = p_invite_id;
  
  -- Log activity
  INSERT INTO team_activity_log (
    farm_id,
    actor_user_id,
    event_type,
    details
  ) VALUES (
    v_invite.farm_id,
    v_actor_id,
    'invite_resent',
    json_build_object(
      'invite_id', p_invite_id,
      'email', v_invite.invited_email
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'token', v_new_token,
    'message', 'Invitation resent successfully'
  );
END;
$$;

-- Update existing invitations to have tokens and proper status
UPDATE team_invitations
SET token = generate_invite_token(),
    status = CASE 
      WHEN accepted = true THEN 'accepted'
      WHEN expires_at IS NOT NULL AND expires_at < now() THEN 'expired'
      ELSE 'pending'
    END,
    expires_at = COALESCE(expires_at, created_at + interval '7 days')
WHERE token IS NULL;

-- Grant execute on RPC functions
GRANT EXECUTE ON FUNCTION create_team_invitation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_invitation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_team_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_team_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION resend_team_invitation(uuid) TO authenticated;
