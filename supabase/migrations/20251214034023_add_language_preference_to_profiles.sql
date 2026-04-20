/*
  # Add Language Preference to Profiles

  1. Changes
    - Add `preferred_language` column to profiles table
    - Set default to 'en' (English)
    - Supports 'en' and 'fr' languages

  2. Security
    - No RLS changes needed (profiles already secured)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'preferred_language'
  ) THEN
    ALTER TABLE profiles ADD COLUMN preferred_language VARCHAR(5) DEFAULT 'en';
  END IF;
END $$;
