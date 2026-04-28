-- Add join_secret to farms for single-use rotating join links
ALTER TABLE farms ADD COLUMN IF NOT EXISTS join_secret text;

-- Seed secrets for all existing farms using built-in UUID (no pgcrypto needed)
UPDATE farms SET join_secret = replace(gen_random_uuid()::text, '-', '') WHERE join_secret IS NULL;

-- Default for new farms
ALTER TABLE farms ALTER COLUMN join_secret SET DEFAULT replace(gen_random_uuid()::text, '-', '');

-- get_farm_name_by_id: returns farm name only if secret matches (null = invalid/expired link)
CREATE OR REPLACE FUNCTION get_farm_name_by_id(p_farm_id uuid, p_secret text DEFAULT NULL)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_secret IS NULL        THEN name
    WHEN join_secret = p_secret  THEN name
    ELSE NULL
  END
  FROM farms WHERE id = p_farm_id LIMIT 1;
$$;

-- join_farm_by_id: validates secret, joins as worker, then rotates secret (single-use)
CREATE OR REPLACE FUNCTION join_farm_by_id(p_farm_id uuid, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_name     text;
  v_stored_secret text;
BEGIN
  SELECT name, join_secret INTO v_farm_name, v_stored_secret
  FROM farms WHERE id = p_farm_id;

  IF v_farm_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Farm not found — ask your farm owner for a fresh link');
  END IF;

  IF v_stored_secret IS NULL OR v_stored_secret != p_secret THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This link has already been used. Ask your farm owner to share a new one.');
  END IF;

  -- Already a member — return without rotating (owner tapping their own link, etc.)
  IF EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id AND user_id = auth.uid() AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_member', true, 'farm_name', v_farm_name);
  END IF;

  -- Add as worker
  INSERT INTO farm_members (farm_id, user_id, role, joined_at, is_active)
  VALUES (p_farm_id, auth.uid(), 'worker', now(), true)
  ON CONFLICT (farm_id, user_id) DO UPDATE
    SET is_active = true, role = 'worker', joined_at = now();

  UPDATE profiles
  SET farm_id = p_farm_id, onboarding_completed = true
  WHERE id = auth.uid();

  -- Rotate secret — this link is now dead
  UPDATE farms SET join_secret = replace(gen_random_uuid()::text, '-', '') WHERE id = p_farm_id;

  RETURN jsonb_build_object('ok', true, 'already_member', false, 'farm_name', v_farm_name);
END;
$$;
