/*
  # Add Onboarding Fields to Profiles

  1. New Columns
    - `onboarding_completed` (boolean, default false) - Whether user has completed onboarding
    - `primary_goal` (text) - User's primary farming goal

  2. Purpose
    - Track onboarding completion state
    - Store user's primary goal for personalized experience
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'primary_goal'
  ) THEN
    ALTER TABLE profiles ADD COLUMN primary_goal text;
  END IF;
END $$;
