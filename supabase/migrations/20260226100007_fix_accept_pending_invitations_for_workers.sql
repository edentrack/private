/*
  # Fix: Workers see your farm after signup/login

  Invitations created by create_team_invitation use status = 'pending', but
  accept_pending_invitations() was only looking for accepted = false. So when
  invited workers signed up or logged in, they were never added to farm_members
  and saw "No farm assigned".

  This migration replaces accept_pending_invitations() to:
  - Match invites by status = 'pending' (and optionally accepted = false for legacy rows)
  - Match email case-insensitively
  - Respect expires_at
  - Add the user to farm_members and mark the invite accepted so they see your farm on next load
*/

-- Drop existing function (earlier migration may have created it with RETURNS void)
DROP FUNCTION IF EXISTS public.accept_pending_invitations();

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
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', true, 'accepted_count', 0);
  END IF;

  -- Process invites that are pending (status = 'pending' or legacy accepted = false)
  FOR v_invitation IN
    SELECT id, farm_id, role, invited_by
    FROM team_invitations
    WHERE lower(trim(invited_email)) = lower(trim(v_email))
      AND (
        status = 'pending'
        OR (status IS NULL AND (accepted = false OR accepted IS NULL))
      )
      AND (expires_at IS NULL OR expires_at > now())
  LOOP
    INSERT INTO farm_members (farm_id, user_id, role, is_active, invited_by, invited_at, joined_at)
    VALUES (v_invitation.farm_id, auth.uid(), v_invitation.role, true, v_invitation.invited_by, now(), now())
    ON CONFLICT (farm_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        is_active = true,
        invited_at = now(),
        joined_at = now(),
        updated_at = now();

    INSERT INTO team_activity_log (farm_id, actor_user_id, target_user_id, event_type, details)
    VALUES (
      v_invitation.farm_id,
      auth.uid(),
      auth.uid(),
      'invitation_accepted',
      jsonb_build_object('role', v_invitation.role)
    );

    UPDATE team_invitations
    SET status = 'accepted',
        accepted_at = now(),
        accepted_by = auth.uid()
    WHERE id = v_invitation.id;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'team_invitations' AND column_name = 'accepted') THEN
      UPDATE team_invitations SET accepted = true WHERE id = v_invitation.id;
    END IF;

    v_accepted_count := v_accepted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'accepted_count', v_accepted_count);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
