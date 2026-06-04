/*
  Vaccine schedule templates — May 2026.

  Allows farms to apply a standard vaccination schedule in one tap and
  then edit any entry (drug name, date, dosage, notes) before or after
  applying. Push reminders fire via the existing `vaccination_due`
  push_subscriptions category.

  Design:
    - `vaccine_schedule_templates` — global seed rows, one per species
      per vaccine event. Not editable by users (is_system = true).
      Farms can add their OWN rows (is_system = false) to customise.
    - `vaccine_schedule_entries` — per-flock/cohort schedule rows
      created when the user taps "Apply schedule". These are the
      editable, farm-owned copies — drug name, date, dosage, notes
      can all be changed. Completed via existing `vaccinations` table
      linkage (vaccination_id FK set when dose is administered).

  Trigger timing:
    trigger_type:
      'age_days'   — offset in days from flock start_date / birth_date
      'age_weeks'  — offset in weeks
      'calendar'   — absolute calendar date (used for seasonal boosters)
      'pre_event'  — N days before a named event (e.g. "2 weeks before mating")

  Species covered at launch: poultry (broiler, layer), rabbits.
  Fish have no standard vaccine schedule — skipped.
*/

-- ── 1. Global template table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vaccine_schedule_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species         text NOT NULL CHECK (species IN ('poultry_broiler','poultry_layer','rabbits')),
  vaccine_name    text NOT NULL,
  trigger_type    text NOT NULL CHECK (trigger_type IN ('age_days','age_weeks','calendar','pre_event')),
  trigger_value   int  NOT NULL,   -- days/weeks offset OR calendar month (1-12) for 'calendar'
  dosage_hint     text,            -- e.g. "0.5 ml / bird eye-drop"
  notes           text,
  is_system       boolean NOT NULL DEFAULT true,
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vst_species_idx ON public.vaccine_schedule_templates (species, display_order);

-- Public read — farms can see all templates
ALTER TABLE public.vaccine_schedule_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read vaccine templates"
  ON public.vaccine_schedule_templates FOR SELECT
  USING (true);

CREATE POLICY "owners can add custom templates"
  ON public.vaccine_schedule_templates FOR INSERT
  WITH CHECK (is_system = false);

-- ── 2. Per-flock schedule entries (editable copies) ─────────────────────
CREATE TABLE IF NOT EXISTS public.vaccine_schedule_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_id          uuid REFERENCES public.flocks(id) ON DELETE CASCADE,
  -- Rabbit growout cohorts (optional — either flock_id or growout_group_id)
  growout_group_id  uuid REFERENCES public.rabbit_growout_groups(id) ON DELETE CASCADE,
  template_id       uuid REFERENCES public.vaccine_schedule_templates(id) ON DELETE SET NULL,
  vaccine_name      text NOT NULL,   -- editable copy of template name
  scheduled_date    date NOT NULL,   -- computed from trigger, then editable
  dosage            text,
  notes             text,
  completed         boolean NOT NULL DEFAULT false,
  reminder_sent     boolean NOT NULL DEFAULT false,
  -- Link to the actual vaccination record once administered
  vaccination_id    uuid REFERENCES public.vaccinations(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vse_farm_idx   ON public.vaccine_schedule_entries (farm_id, scheduled_date);
CREATE INDEX IF NOT EXISTS vse_flock_idx  ON public.vaccine_schedule_entries (flock_id, scheduled_date) WHERE flock_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vse_due_idx    ON public.vaccine_schedule_entries (scheduled_date, completed, reminder_sent)
  WHERE completed = false AND reminder_sent = false;

ALTER TABLE public.vaccine_schedule_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members manage schedule entries"
  ON public.vaccine_schedule_entries FOR ALL
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- ── 3. Seed standard vaccine schedules ─────────────────────────────────

-- ── Broiler (meat chicken, 35-42 day cycle) ──────────────────────────
INSERT INTO public.vaccine_schedule_templates
  (species, vaccine_name, trigger_type, trigger_value, dosage_hint, notes, display_order)
VALUES
  ('poultry_broiler', 'Newcastle Disease (LaSota)',    'age_days',  7,  '1–2 drops eye/nostril', 'Live attenuated. Mix fresh per batch.', 10),
  ('poultry_broiler', 'Gumboro / IBD',                 'age_days', 14,  '2 drops drinking water', 'Give when maternal antibody titre waning (~day 14).', 20),
  ('poultry_broiler', 'Newcastle Disease — booster',   'age_days', 28,  '1–2 drops eye/nostril', 'Spray or eye-drop. Check water quality first.', 30),
  ('poultry_broiler', 'Fowl Typhoid (ADE-40)',         'age_days', 35,  '0.5 ml SC injection', 'Optional if Salmonella risk in region.', 40)
ON CONFLICT DO NOTHING;

-- ── Layer (laying hen, continuous production) ─────────────────────────
INSERT INTO public.vaccine_schedule_templates
  (species, vaccine_name, trigger_type, trigger_value, dosage_hint, notes, display_order)
VALUES
  ('poultry_layer', 'Marek''s Disease',                 'age_days',   0,  '0.2 ml SC — hatchery only', 'Given at hatchery day 0. Flag if not done.', 5),
  ('poultry_layer', 'Newcastle + IB (combined)',         'age_days',   7,  '1–2 drops eye/nostril', 'Repeat every 8 weeks throughout lay.', 10),
  ('poultry_layer', 'Gumboro / IBD',                    'age_days',  14,  '2 drops drinking water', 'Give when maternal antibody titre waning.', 20),
  ('poultry_layer', 'Newcastle + IB booster',           'age_days',  21,  '1–2 drops eye/nostril', '3-week booster. Critical before transfer.', 30),
  ('poultry_layer', 'Infectious Coryza',                'age_weeks',  8,  '0.5 ml IM injection', 'If Haemophilus pressure in your region.', 40),
  ('poultry_layer', 'Egg Drop Syndrome (EDS-76)',       'age_weeks', 14,  '0.5 ml IM injection', 'Before lay onset. Oil-emulsion vaccine.', 50),
  ('poultry_layer', 'Newcastle + IB — 8-wk repeat',    'age_weeks', 22,  '1–2 drops eye/nostril', 'Continue repeating every 8 weeks in lay.', 60)
ON CONFLICT DO NOTHING;

-- ── Rabbits (based on WSAVA + West/Central Africa vet guidelines) ─────
INSERT INTO public.vaccine_schedule_templates
  (species, vaccine_name, trigger_type, trigger_value, dosage_hint, notes, display_order)
VALUES
  ('rabbits', 'Myxomatosis — primary',        'age_weeks',  8,  '0.5 ml SC injection', 'Primary at 8 weeks. Required before first breeding.', 10),
  ('rabbits', 'RHD / RHDV1+2 — primary',     'age_weeks', 10,  '1 ml SC injection', 'Give 2 weeks after myxomatosis primary.', 20),
  ('rabbits', 'Pasteurella — primary',        'age_weeks', 12,  '0.5 ml SC injection', 'Especially important for breeding does.', 30),
  ('rabbits', 'Myxomatosis — booster',        'age_weeks', 34,  '0.5 ml SC injection', '6-month booster (26 weeks after primary).', 40),
  ('rabbits', 'RHD / RHDV1+2 — annual',      'age_weeks', 62,  '1 ml SC injection', '12-month booster. Calendar-lock to same time each year.', 50),
  ('rabbits', 'Pasteurella — 6-month booster','age_weeks', 38,  '0.5 ml SC injection', 'Every 6 months for breeding stock.', 60),
  ('rabbits', 'Pre-mating booster (does)',    'pre_event', 14,  '0.5 ml SC injection', '2 weeks before planned mating. Pasteurella + RHD.', 70)
ON CONFLICT DO NOTHING;

-- ── 4. Rabbit growout weight tracking ──────────────────────────────────
/*
  Each weight sample captures the average of a random sample from the
  cohort. Used to compute FCR (feed conversion ratio) and flag when
  the cohort hits market weight (2.0–2.5 kg).
*/
CREATE TABLE IF NOT EXISTS public.rabbit_weight_samples (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  growout_group_id  uuid NOT NULL REFERENCES public.rabbit_growout_groups(id) ON DELETE CASCADE,
  sample_date       date NOT NULL DEFAULT CURRENT_DATE,
  sample_size       int NOT NULL DEFAULT 5,     -- number of rabbits weighed
  avg_weight_kg     numeric(5,3) NOT NULL,       -- average of the sample
  min_weight_kg     numeric(5,3),
  max_weight_kg     numeric(5,3),
  -- Feed consumed since last sample (bags × kg_per_bag)
  feed_consumed_kg  numeric(8,3),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rws_growout_date_idx
  ON public.rabbit_weight_samples (growout_group_id, sample_date DESC);

ALTER TABLE public.rabbit_weight_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members manage rabbit weight samples"
  ON public.rabbit_weight_samples FOR ALL
  USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.rabbit_weight_samples IS
  'Weekly weight samples per grow-out cohort. Used for FCR tracking and market-ready detection (avg_weight_kg >= 2.0).';
