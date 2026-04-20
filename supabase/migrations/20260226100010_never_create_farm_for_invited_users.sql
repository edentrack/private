-- =============================================================================
-- Never create a farm for users who were invited (by email).
-- Prevents workers from getting their own farm when they use the invite link.
-- =============================================================================

-- Returns true if the current user's email appears in any team_invitation
-- (pending or accepted). Used to avoid creating a new farm for invited users.
CREATE OR REPLACE FUNCTION public.user_was_invited_to_farm()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM team_invitations
    WHERE lower(trim(invited_email)) = lower(trim(v_email))
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_was_invited_to_farm() TO authenticated;
