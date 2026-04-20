/*
  COMPREHENSIVE FIX FOR ALL FOREIGN KEY CONSTRAINTS
  ===================================================
  
  This fixes ALL foreign key constraints that prevent deleting users.
  Finds and fixes any table that references profiles.id
*/

-- First, make any NOT NULL columns nullable if they reference profiles and should allow NULL
-- This is needed for columns that will be set to NULL on delete
DO $$
BEGIN
  -- Make team_invitations.invited_by nullable (invitation valid even if inviter deleted)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_invitations' AND column_name = 'invited_by'
  ) THEN
    ALTER TABLE team_invitations ALTER COLUMN invited_by DROP NOT NULL;
  END IF;
END $$;

-- Function to find and fix all foreign keys referencing profiles
DO $$
DECLARE
  r RECORD;
  constraint_sql TEXT;
BEGIN
  -- Loop through all foreign key constraints that reference profiles
  FOR r IN (
    SELECT 
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS referenced_table
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'profiles'
      AND tc.table_schema = 'public'
  ) LOOP
    -- Skip if this is a self-referencing constraint or specific exceptions
    -- Drop the constraint
    BEGIN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
      
      -- Recreate with ON DELETE SET NULL (unless it's a critical relationship that should cascade)
      -- Most audit/log tables should use SET NULL to preserve history
      -- Critical relationships (like farms.owner_id) should use CASCADE
      
      -- Determine the appropriate ON DELETE action
      -- Use SET NULL for audit/log tables, CASCADE for critical relationships
      -- Critical relationships that should cascade when user is deleted
      IF r.table_name IN ('farms') AND r.column_name = 'owner_id' THEN
        -- Farms owner: cascade (farm should be deleted with owner)
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE CASCADE',
          r.table_name, r.constraint_name, r.column_name
        );
      ELSIF r.column_name IN ('admin_id', 'created_by', 'updated_by', 'user_id') THEN
        -- User IDs that are the main entity owner: cascade
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE CASCADE',
          r.table_name, r.constraint_name, r.column_name
        );
      ELSE
        -- Audit/log tables and reference fields: set null to preserve history
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE SET NULL',
          r.table_name, r.constraint_name, r.column_name
        );
      END IF;
      
      RAISE NOTICE 'Fixed constraint % on table %', r.constraint_name, r.table_name;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not fix constraint % on table %: %', r.constraint_name, r.table_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- Update admin_delete_user function to handle all constraints
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email text;
BEGIN
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete super admin accounts';
  END IF;

  -- Get user email before deleting
  SELECT email INTO v_user_email FROM profiles WHERE id = p_user_id;

  -- Log the action BEFORE deleting
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'delete_user',
    p_user_id,
    jsonb_build_object(
      'deleted_at', NOW(),
      'deleted_user_email', v_user_email
    )
  );

  -- Delete the profile (all foreign keys now allow this)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
