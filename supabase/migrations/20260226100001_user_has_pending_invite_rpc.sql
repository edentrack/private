/*
  # user_has_pending_farm_invite – avoid creating a farm for invite-only users

  When a user signs up via an invite link but lands on the app before accepting,
  we should not create a new farm for them. This RPC lets the client check:
  "does the current user have a pending farm invitation?" If yes, skip creating
  a farm so they only get access by accepting the invite.
*/
CREATE OR REPLACE FUNCTION public.user_has_pending_farm_invite()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM team_invitations
    WHERE lower(invited_email) = lower(v_email)
      AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_pending_farm_invite() TO authenticated;
