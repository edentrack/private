/*
  # Add Missing Foreign Key Relationships

  1. Changes
    - Add FK from team_invitations.invited_by to profiles.id
    - Add FK from team_activity_log.actor_user_id to profiles.id
    - Add FK from team_activity_log.target_user_id to profiles.id

  2. Notes
    - These FKs enable Supabase to resolve joins in queries
*/

-- Fix team_invitations FK (drop existing if it points to auth.users and recreate to profiles)
DO $$
BEGIN
  -- Check if FK exists to auth.users and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_invitations_invited_by_fkey'
      AND table_name = 'team_invitations'
  ) THEN
    ALTER TABLE team_invitations DROP CONSTRAINT team_invitations_invited_by_fkey;
  END IF;
  
  -- Add FK to profiles
  ALTER TABLE team_invitations
    ADD CONSTRAINT team_invitations_invited_by_profiles_fkey
    FOREIGN KEY (invited_by) REFERENCES profiles(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Fix team_activity_log actor_user_id FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_activity_log_actor_user_id_fkey'
      AND table_name = 'team_activity_log'
  ) THEN
    ALTER TABLE team_activity_log DROP CONSTRAINT team_activity_log_actor_user_id_fkey;
  END IF;
  
  ALTER TABLE team_activity_log
    ADD CONSTRAINT team_activity_log_actor_profiles_fkey
    FOREIGN KEY (actor_user_id) REFERENCES profiles(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Fix team_activity_log target_user_id FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_activity_log_target_user_id_fkey'
      AND table_name = 'team_activity_log'
  ) THEN
    ALTER TABLE team_activity_log DROP CONSTRAINT team_activity_log_target_user_id_fkey;
  END IF;
  
  ALTER TABLE team_activity_log
    ADD CONSTRAINT team_activity_log_target_profiles_fkey
    FOREIGN KEY (target_user_id) REFERENCES profiles(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;