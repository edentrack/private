/*
  SYNC FARM MEMBERSHIP WITH PROFILES.FARM_ID
  ============================================
  
  Problem: Users who are farm members (but not owners) may have
  profiles.farm_id as NULL, even though they're active members in farm_members.
  
  Solution: 
  1. Create a function to sync profiles.farm_id with active farm membership
  2. Update existing profiles that are members but don't have farm_id set
  3. Create a trigger to auto-update profiles.farm_id when farm_members changes
*/

-- Function to sync a user's farm_id with their active farm membership
CREATE OR REPLACE FUNCTION sync_user_farm_id(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_farm_id uuid;
BEGIN
  -- Get the user's primary farm:
  -- 1. If they own a farm, use that
  -- 2. Otherwise, use their first active farm membership
  SELECT COALESCE(
    (SELECT id FROM farms WHERE owner_id = p_user_id LIMIT 1),
    (SELECT farm_id FROM farm_members 
     WHERE user_id = p_user_id 
     AND is_active = true 
     ORDER BY 
       CASE role 
         WHEN 'owner' THEN 1
         WHEN 'manager' THEN 2
         WHEN 'worker' THEN 3
         WHEN 'viewer' THEN 4
       END,
       joined_at DESC
     LIMIT 1)
  ) INTO v_farm_id;

  -- Update profiles.farm_id if it's different and column exists
  IF v_farm_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'farm_id'
  ) THEN
    UPDATE profiles
    SET farm_id = v_farm_id
    WHERE id = p_user_id
    AND (farm_id IS NULL OR farm_id != v_farm_id);
  END IF;
END;
$$;

-- Check if farm_id column exists, and sync all existing users who are farm members
DO $$
BEGIN
  -- Only run if farm_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'farm_id'
  ) THEN
    -- Sync all existing users who are farm members but don't have farm_id set
    UPDATE profiles p
    SET farm_id = (
      SELECT COALESCE(
        (SELECT id FROM farms WHERE owner_id = p.id LIMIT 1),
        (SELECT farm_id FROM farm_members 
         WHERE user_id = p.id 
         AND is_active = true 
         ORDER BY 
           CASE role 
             WHEN 'owner' THEN 1
             WHEN 'manager' THEN 2
             WHEN 'worker' THEN 3
             WHEN 'viewer' THEN 4
           END,
           joined_at DESC
         LIMIT 1)
      )
    )
    WHERE farm_id IS NULL
    AND EXISTS (
      SELECT 1 FROM farms WHERE owner_id = p.id
      UNION
      SELECT 1 FROM farm_members WHERE user_id = p.id AND is_active = true
    );
  END IF;
END $$;

-- Function to sync farm_id when farm_members changes
-- Only create if farm_id column exists
CREATE OR REPLACE FUNCTION sync_farm_member_farm_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only sync if farm_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'farm_id'
  ) THEN
    PERFORM sync_user_farm_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-sync when a user joins or updates farm membership
-- Only create if farm_id column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'farm_id'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_sync_farm_member_farm_id ON farm_members;
    CREATE TRIGGER trigger_sync_farm_member_farm_id
      AFTER INSERT OR UPDATE OF is_active, role, farm_id ON farm_members
      FOR EACH ROW
      WHEN (NEW.is_active = true)
      EXECUTE FUNCTION sync_farm_member_farm_id();
  END IF;
END $$;

-- Also sync when user becomes a farm owner
-- Only create if farm_id column exists
CREATE OR REPLACE FUNCTION sync_farm_owner_farm_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only sync if farm_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'farm_id'
  ) THEN
    PERFORM sync_user_farm_id(NEW.owner_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to sync when a farm is created or owner changes
-- Only create if farm_id column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'farm_id'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_sync_farm_owner_farm_id ON farms;
    CREATE TRIGGER trigger_sync_farm_owner_farm_id
      AFTER INSERT OR UPDATE OF owner_id ON farms
      FOR EACH ROW
      EXECUTE FUNCTION sync_farm_owner_farm_id();
  END IF;
END $$;
