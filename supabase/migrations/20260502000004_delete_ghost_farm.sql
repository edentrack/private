-- Delete every farm owned by athelaw1@gmail.com that is NOT named 'Ebenezer'.
-- The ghost farm was auto-created by AuthContext fallback logic during a testing session.

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'athelaw1@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User athelaw1@gmail.com not found — skipping';
    RETURN;
  END IF;

  DELETE FROM farms
  WHERE owner_id = v_user_id
    AND name NOT ILIKE '%Ebenezer%';

  RAISE NOTICE 'Ghost farms removed for user %', v_user_id;
END $$;
