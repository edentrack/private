-- Reset accounts with onboarding_completed=true but no farm membership.
-- These users hit "Skip setup for now" before the button was removed and ended
-- up in a state where the wizard wouldn't show but no farm existed.
UPDATE profiles
SET onboarding_completed = false
WHERE onboarding_completed = true
  AND is_super_admin = false
  AND NOT EXISTS (
    SELECT 1 FROM farm_members fm WHERE fm.user_id = profiles.id
  );
