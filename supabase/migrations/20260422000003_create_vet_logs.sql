-- Veterinary log: track vet visits, diagnoses, medications, withdrawal periods

CREATE TABLE IF NOT EXISTS public.vet_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_id              uuid REFERENCES public.flocks(id) ON DELETE SET NULL,
  visit_date            date NOT NULL,
  vet_name              text,
  diagnosis             text,
  medication            text,
  dosage                text,
  withdrawal_period_days integer,
  notes                 text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vet_logs_farm_date ON public.vet_logs (farm_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_vet_logs_flock ON public.vet_logs (flock_id) WHERE flock_id IS NOT NULL;

ALTER TABLE public.vet_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_members_select_vet_logs" ON public.vet_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.farm_members
      WHERE farm_id = vet_logs.farm_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "farm_members_insert_vet_logs" ON public.vet_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.farm_members
      WHERE farm_id = vet_logs.farm_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "farm_members_update_vet_logs" ON public.vet_logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.farm_members
      WHERE farm_id = vet_logs.farm_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "farm_members_delete_vet_logs" ON public.vet_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.farm_members
      WHERE farm_id = vet_logs.farm_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );
