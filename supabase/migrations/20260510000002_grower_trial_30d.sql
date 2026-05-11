/*
  30-day Grower trial for new signups.

  Replaces the 14-day pro trial that the previous migration removed.
  This time it's structured differently: we keep the subscription_tier
  on 'free' so paid subscription gating logic stays untouched, but add
  a separate `trial_grower_until` timestamp. Frontend reads BOTH:

    effective_tier =
      if trial_grower_until > now() and subscription_tier = 'free'
        then 'pro'   -- Grower-equivalent during trial
      else subscription_tier

  Why split it that way:
    1. Trial expiry doesn't accidentally cancel anyone's paid plan.
    2. We can show users a clean "trial ends in N days" countdown
       without scanning the subscription_expires_at column.
    3. When the trial expires, we don't need a cron — the next time
       getEffectiveTier() runs it returns 'free' automatically and
       the OverflowModal kicks in if they have Grower-level data.

  Existing users get the trial backdated to now (so they get a fresh
  30 days of Grower from when this migration runs) IF they're still
  on Free. Anyone who already has a paid subscription is untouched.
*/

-- 1. Add the column ----------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_grower_until timestamptz;

COMMENT ON COLUMN public.profiles.trial_grower_until IS
  'New signups get 30 days of Grower-tier access. Read alongside subscription_tier via getEffectiveTier helper. NULL = no trial active.';

-- 2. Update handle_new_user to set the trial on signup ----------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (
    id, full_name, email,
    subscription_tier, subscription_expires_at,
    trial_grower_until
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'free',
    NULL,
    now() + interval '30 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);

  RETURN new;
END;
$$;

-- 3. Backfill: give every existing Free-tier user a fresh 30-day trial
--    starting now. Skips users on a paid plan (subscription_tier != 'free')
--    so we don't accidentally nuke someone's expiry timing.

UPDATE public.profiles
   SET trial_grower_until = now() + interval '30 days'
 WHERE subscription_tier = 'free'
   AND trial_grower_until IS NULL;
