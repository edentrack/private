/*
  # Signup alerts and trial period

  1. signup_alerts table
    - Stores one row per new profile so you can show "new signup" alerts (e.g. in super-admin).
  2. Trigger on profiles
    - AFTER INSERT on public.profiles, insert into signup_alerts (user_id, email, full_name).
  3. handle_new_user (trial)
    - New signups get subscription_tier = 'pro' and subscription_expires_at = NOW() + 14 days.
    - Change the interval below to adjust trial length (e.g. 7 days or 30 days).
*/

-- 1. Table for signup alerts (super-admin can query this or you can wire it to email/Slack)
CREATE TABLE IF NOT EXISTS public.signup_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: only super admins can read signup_alerts
ALTER TABLE public.signup_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view signup alerts" ON public.signup_alerts;
CREATE POLICY "Super admins can view signup alerts"
  ON public.signup_alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_super_admin = true
    )
  );

-- No INSERT/UPDATE/DELETE for clients; only the trigger inserts
-- (service role or trigger runs as definer and bypasses RLS for insert)

-- Allow the trigger to insert (trigger runs as the role that inserts into profiles, which is the auth trigger)
-- So the INSERT into signup_alerts happens from the same transaction as the profile insert.
-- We need a policy that allows insert when the row is about the same user... but trigger runs in system context.
-- Safer: use a SECURITY DEFINER function to insert into signup_alerts so it bypasses RLS.
CREATE OR REPLACE FUNCTION public.notify_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.signup_alerts (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.full_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_notify_signup ON public.profiles;
CREATE TRIGGER on_profile_created_notify_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_signup();

-- 2. Trial period: update handle_new_user so new signups get a 14-day trial
-- (Existing users are unchanged due to ON CONFLICT only updating email/full_name.)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, subscription_tier, subscription_expires_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'pro',
    NOW() + interval '14 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);

  RETURN new;
END;
$$;

COMMENT ON TABLE public.signup_alerts IS 'One row per new signup; super-admin can show alerts or wire to email/Slack.';
COMMENT ON COLUMN public.profiles.subscription_expires_at IS 'When subscription/trial ends; new signups get 14-day trial from handle_new_user.';
