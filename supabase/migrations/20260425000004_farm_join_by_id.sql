-- Public function: returns just the farm name given an ID (used on signup screen before auth)
CREATE OR REPLACE FUNCTION get_farm_name_by_id(p_farm_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name FROM farms WHERE id = p_farm_id LIMIT 1;
$$;

-- RPC: join a farm by its ID (called after auth is confirmed)
-- Sets the user as a worker, updates their primary farm, marks onboarding done
CREATE OR REPLACE FUNCTION join_farm_by_id(p_farm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_name text;
  v_already   boolean := false;
BEGIN
  SELECT name INTO v_farm_name FROM farms WHERE id = p_farm_id;

  IF v_farm_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Farm not found — ask your farm owner for a fresh link');
  END IF;

  -- Check if already an active member
  IF EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id AND user_id = auth.uid() AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_member', true, 'farm_name', v_farm_name);
  END IF;

  -- Insert as worker (or reactivate if previously removed)
  INSERT INTO farm_members (farm_id, user_id, role, joined_at, is_active)
  VALUES (p_farm_id, auth.uid(), 'worker', now(), true)
  ON CONFLICT (farm_id, user_id) DO UPDATE
    SET is_active = true, role = 'worker', joined_at = now();

  -- Set as primary farm and mark onboarding done (workers skip the create-farm wizard)
  UPDATE profiles
  SET farm_id = p_farm_id,
      onboarding_completed = true
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true, 'already_member', false, 'farm_name', v_farm_name);
END;
$$;
