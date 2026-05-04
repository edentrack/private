-- Remove all but the oldest farm for athelaw1@gmail.com
-- Keeps flocks/expenses/data from the surviving farm; second duplicate was created during testing

DO $$
DECLARE
  v_user_id UUID;
  v_keep_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'athelaw1@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User not found, skipping';
    RETURN;
  END IF;

  -- Keep the oldest farm (first created)
  SELECT id INTO v_keep_id
  FROM farms
  WHERE owner_id = v_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- Delete all other farms owned by this user
  DELETE FROM farms
  WHERE owner_id = v_user_id
    AND id != v_keep_id;

  RAISE NOTICE 'Kept farm %, removed duplicates for user %', v_keep_id, v_user_id;
END $$;
