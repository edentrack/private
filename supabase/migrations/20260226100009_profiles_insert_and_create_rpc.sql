-- =============================================================================
-- Fix profile creation: ensure INSERT policy and add RPC fallback
-- Resolves: 403/401 on auth and "new row violates row-level security" on profiles
-- =============================================================================

-- 1) Ensure authenticated users can insert their own profile (id = auth.uid())
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND id = auth.uid());

-- 2) RPC so profile creation works even when RLS blocks (e.g. token edge cases)
CREATE OR REPLACE FUNCTION public.create_my_profile_if_missing(
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_name text;
  v_email text;
  v_meta jsonb;
BEGIN
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT raw_user_meta_data INTO v_meta FROM auth.users WHERE id = v_id;
  v_name := coalesce(p_full_name, v_meta->>'full_name', split_part(coalesce(p_email, (SELECT email FROM auth.users WHERE id = v_id), ''), '@', 1), 'User');
  v_email := coalesce(p_email, (SELECT email FROM auth.users WHERE id = v_id), '');

  INSERT INTO profiles (id, full_name, email, account_status, subscription_tier)
  VALUES (v_id, v_name, v_email, 'pending', 'free')
  ON CONFLICT (id) DO UPDATE SET
    full_name = coalesce(profiles.full_name, EXCLUDED.full_name),
    email = coalesce(profiles.email, EXCLUDED.email),
    updated_at = now();

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_my_profile_if_missing(text, text) TO authenticated;
