-- Phase G — Web push subscriptions.
--
-- One row per (user, device). A single user can have multiple devices
-- (phone, laptop, tablet); each gets its own subscription endpoint.
--
-- The endpoint URL itself is unique per device, so we use it as the
-- conflict key for upserts.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth_key      text NOT NULL,
  user_agent    text,
  -- Per-user opt-out per category. Default: opt-in to everything; specific
  -- categories can be disabled.
  prefs         jsonb NOT NULL DEFAULT '{"pond_alert": true, "task_overdue": true, "vaccination_due": true, "low_feed": true, "mortality_spike": true, "water_quality": true}'::jsonb,
  -- Auto-disable after consecutive failures (subscription expired or revoked
  -- by user). Re-enabled when client re-subscribes.
  enabled       boolean NOT NULL DEFAULT true,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subs_user_idx ON public.push_subscriptions (user_id) WHERE enabled = true;

CREATE OR REPLACE FUNCTION public.touch_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS push_subs_touch_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subs_touch_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_push_subscriptions_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Each user manages only their own subscriptions.
DROP POLICY IF EXISTS push_subs_select_own ON public.push_subscriptions;
CREATE POLICY push_subs_select_own ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_insert_own ON public.push_subscriptions;
CREATE POLICY push_subs_insert_own ON public.push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_update_own ON public.push_subscriptions;
CREATE POLICY push_subs_update_own ON public.push_subscriptions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subs_delete_own ON public.push_subscriptions;
CREATE POLICY push_subs_delete_own ON public.push_subscriptions
  FOR DELETE USING (user_id = auth.uid());
