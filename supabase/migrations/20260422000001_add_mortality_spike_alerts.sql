CREATE TABLE IF NOT EXISTS public.mortality_spike_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_name       text NOT NULL,
  today_deaths     integer NOT NULL,
  avg_daily_deaths numeric(6,2) NOT NULL,
  spike_ratio      numeric(6,2) NOT NULL,
  likely_causes    text[] NOT NULL DEFAULT '{}',
  alert_date       date NOT NULL DEFAULT CURRENT_DATE,
  acknowledged     boolean NOT NULL DEFAULT false,
  acknowledged_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mortality_spike_alerts_farm_date_idx
  ON public.mortality_spike_alerts (farm_id, alert_date DESC);

ALTER TABLE public.mortality_spike_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_members_see_alerts" ON public.mortality_spike_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.farm_members
      WHERE farm_id = mortality_spike_alerts.farm_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "farm_members_update_alerts" ON public.mortality_spike_alerts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.farm_members
      WHERE farm_id = mortality_spike_alerts.farm_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );
