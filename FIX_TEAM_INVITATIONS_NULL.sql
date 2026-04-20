/*
  FIX TEAM_INVITATIONS INVITED_BY NULL CONSTRAINT
  ================================================
  
  Problem: team_invitations.invited_by is NOT NULL, but we're trying
  to set it to NULL when the inviter is deleted.
  
  Solution: Make invited_by nullable (invitation is still valid even
  if the inviter is deleted)
*/

-- Make invited_by nullable (invitations are still valid if inviter is deleted)
ALTER TABLE team_invitations
  ALTER COLUMN invited_by DROP NOT NULL;

-- Ensure the foreign key uses ON DELETE SET NULL
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'team_invitations'
    AND constraint_name LIKE '%invited_by%'
    AND constraint_type = 'FOREIGN KEY'
  ) THEN
    -- Find and drop the constraint
    DECLARE
      constraint_name_var TEXT;
    BEGIN
      SELECT constraint_name INTO constraint_name_var
      FROM information_schema.table_constraints
      WHERE table_name = 'team_invitations'
      AND constraint_name LIKE '%invited_by%'
      AND constraint_type = 'FOREIGN KEY'
      LIMIT 1;
      
      IF constraint_name_var IS NOT NULL THEN
        EXECUTE format('ALTER TABLE team_invitations DROP CONSTRAINT IF EXISTS %I', constraint_name_var);
      END IF;
    END;
  END IF;
  
  -- Recreate with ON DELETE SET NULL
  ALTER TABLE team_invitations
    ADD CONSTRAINT team_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
