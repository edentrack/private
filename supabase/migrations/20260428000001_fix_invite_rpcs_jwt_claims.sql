-- =============================================================================
-- Fix: read user email from JWT claims instead of auth.users direct query.
-- Newer Supabase versions restrict access to auth.users from SECURITY DEFINER
-- functions. JWT claims are always available via request.jwt.claims setting.
-- Also adds EXCEPTION handlers so any remaining error returns false (safe default).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_has_pending_farm_invite()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_email := nullif(trim(
    coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', '')
  ), '');

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
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_pending_farm_invite() TO authenticated;


CREATE OR REPLACE FUNCTION public.user_was_invited_to_farm()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_email := nullif(trim(
    coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', '')
  ), '');

  IF v_email IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM team_invitations
    WHERE lower(trim(invited_email)) = lower(trim(v_email))
    LIMIT 1
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_was_invited_to_farm() TO authenticated;
