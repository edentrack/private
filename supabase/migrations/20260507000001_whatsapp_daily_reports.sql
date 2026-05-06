-- Phase G — WhatsApp daily report subscriptions.
--
-- A separate table keyed by (farm_id, user_id) so multiple members of a
-- farm can each opt in or out independently. Cleaner than a flag on
-- profiles because:
--   - one user with multiple farms can opt in differently per farm
--   - a farm owner can see who on the farm has reports active
--   - we get last_sent_at + delivery audit fields for free
--
-- Phone number stored in E.164 format (+CCXXXXXXXXX). Send fails fast if
-- the format doesn't validate.

CREATE TABLE IF NOT EXISTS public.whatsapp_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164        text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  enabled           boolean NOT NULL DEFAULT true,
  -- Local time the user wants the daily report. Combined with the farm's
  -- timezone (farms.timezone) at cron time to figure out who to send to.
  delivery_time_local time NOT NULL DEFAULT '06:30:00',
  last_sent_at      timestamptz,
  last_send_status  text,            -- 'ok' | 'failed' | error message
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, user_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_subs_farm_idx ON public.whatsapp_subscriptions (farm_id);
CREATE INDEX IF NOT EXISTS whatsapp_subs_enabled_idx ON public.whatsapp_subscriptions (enabled) WHERE enabled = true;

-- Auto-update updated_at on every row update.
CREATE OR REPLACE FUNCTION public.touch_whatsapp_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_subs_touch_updated_at ON public.whatsapp_subscriptions;
CREATE TRIGGER whatsapp_subs_touch_updated_at
  BEFORE UPDATE ON public.whatsapp_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_subscriptions_updated_at();

-- RLS — the standard 4-policy block scoped to farm membership, with the
-- additional constraint that user_id MUST equal auth.uid() for INSERT/UPDATE.
-- That stops a manager from enrolling another team member's phone number.
ALTER TABLE public.whatsapp_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_subs_select ON public.whatsapp_subscriptions;
CREATE POLICY whatsapp_subs_select ON public.whatsapp_subscriptions
  FOR SELECT USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS whatsapp_subs_insert_own ON public.whatsapp_subscriptions;
CREATE POLICY whatsapp_subs_insert_own ON public.whatsapp_subscriptions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS whatsapp_subs_update_own ON public.whatsapp_subscriptions;
CREATE POLICY whatsapp_subs_update_own ON public.whatsapp_subscriptions
  FOR UPDATE USING (
    user_id = auth.uid()
    AND farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    user_id = auth.uid()
    AND farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS whatsapp_subs_delete_own ON public.whatsapp_subscriptions;
CREATE POLICY whatsapp_subs_delete_own ON public.whatsapp_subscriptions
  FOR DELETE USING (
    user_id = auth.uid()
    AND farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
