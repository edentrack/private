/*
  # Fix Handle New User Function for Signup

  1. Changes
    - Recreate handle_new_user function with SECURITY DEFINER
    - This allows the function to bypass RLS when creating profiles
    - Also populates email column from auth.users

  2. Notes
    - The function runs during auth.users INSERT trigger
    - auth.uid() is not available at trigger time
    - SECURITY DEFINER allows the function to run as the owner (bypassing RLS)
*/

-- Drop and recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);
  
  RETURN new;
END;
$$;