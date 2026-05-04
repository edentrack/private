-- Delete empty duplicate farms for athelaw1@gmail.com
-- Keeps any farm that has flocks, expenses, or other data; deletes only truly empty ones

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'athelaw1@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User not found, skipping cleanup';
    RETURN;
  END IF;

  DELETE FROM farms
  WHERE owner_id = v_user_id
    -- Only delete farms with zero flocks
    AND id NOT IN (SELECT DISTINCT farm_id FROM flocks)
    -- And zero expenses
    AND id NOT IN (SELECT DISTINCT farm_id FROM expenses)
    -- And zero egg collections
    AND id NOT IN (SELECT DISTINCT farm_id FROM egg_collections)
    -- And no invited team members (not counting the owner themselves)
    AND id NOT IN (
      SELECT DISTINCT farm_id FROM farm_members WHERE role != 'owner'
    );

  RAISE NOTICE 'Duplicate empty farms removed for user %', v_user_id;
END $$;
