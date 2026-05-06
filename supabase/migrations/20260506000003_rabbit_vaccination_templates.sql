-- Phase C — Rabbit vaccination schedule template seed.
--
-- Seeds the standard RHD (Rabbit Haemorrhagic Disease) and Myxomatosis
-- vaccination schedule onto every rabbit farm. These are the two
-- non-negotiable vaccinations for commercial meat rabbit operations
-- in Africa, especially in regions where wild lagomorphs are vectors.
--
-- Standard protocol (per WSAVA + national veterinary guidelines for
-- East/West/Central Africa):
--
--   Myxomatosis (Myxoma virus):
--     - Primary: 8 weeks of age
--     - Booster: every 6 months
--   RHD (RHDV1 + RHDV2 combined where available):
--     - Primary: 10-12 weeks of age
--     - Booster: every 12 months
--   Both:
--     - Booster all does 2 weeks before mating
--     - Booster all stock at start of rainy season (vector pressure peaks)
--
-- This migration just creates the *template* tasks. Per-flock scheduled
-- dates are computed when the flock is created (existing logic in
-- vaccinationSchedule + the relevant scheduling code).
--
-- Idempotent — every INSERT is gated by NOT EXISTS on (farm_id, title).

DO $$
DECLARE
  rabbit_farm_id uuid;
  template_row text[];
  templates_to_seed text[][];
  t_title text;
  t_freq text;
  t_category text;
  t_scope text;
BEGIN
  -- Each row: title, frequency, category, scope
  templates_to_seed := ARRAY[
    ARRAY['Myxomatosis primary vaccination (8 weeks)', 'monthly', 'Vaccinations', 'rabbits'],
    ARRAY['Myxomatosis booster (6 months)',            'monthly', 'Vaccinations', 'rabbits'],
    ARRAY['RHD primary vaccination (10-12 weeks)',     'monthly', 'Vaccinations', 'rabbits'],
    ARRAY['RHD booster (annual)',                      'monthly', 'Vaccinations', 'rabbits'],
    ARRAY['Pre-mating booster (2 weeks before)',       'monthly', 'Vaccinations', 'rabbits'],
    ARRAY['Rainy-season booster — vector pressure peak','monthly','Vaccinations', 'rabbits'],
    -- Daily/weekly tasks for rabbit operations
    ARRAY['Inspect rabbits for snuffles / ear mites',  'daily',   'Health',       'rabbits'],
    ARRAY['Check water nipples + refill',              'daily',   'Husbandry',    'rabbits'],
    ARRAY['Feed pellets + greens',                     'daily',   'Feeding',      'rabbits'],
    ARRAY['Spot-clean droppings tray',                 'daily',   'Husbandry',    'rabbits'],
    ARRAY['Weight sample (5-10 kits/grow-outs)',       'weekly',  'Production',   'rabbits'],
    ARRAY['Check breeding doe condition',              'weekly',  'Breeding',     'rabbits'],
    ARRAY['Sanitise hutches + nest boxes',             'weekly',  'Biosecurity',  'rabbits'],
    ARRAY['Coccidiostat top-up if seasonal',           'monthly', 'Health',       'rabbits'],
    ARRAY['Doe-buck rotation review',                  'monthly', 'Breeding',     'rabbits'],
    ARRAY['Harvest readiness assessment',              'monthly', 'Production',   'rabbits']
  ];

  FOR rabbit_farm_id IN
    SELECT id FROM public.farms WHERE farm_type = 'rabbits'
  LOOP
    FOREACH template_row SLICE 1 IN ARRAY templates_to_seed LOOP
      t_title := template_row[1];
      t_freq := template_row[2];
      t_category := template_row[3];
      t_scope := template_row[4];

      INSERT INTO public.task_templates (
        farm_id, title, default_frequency, category, scope,
        is_active, is_enabled, created_at
      )
      SELECT rabbit_farm_id, t_title, t_freq, t_category, t_scope, true, true, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.task_templates
        WHERE farm_id = rabbit_farm_id AND title = t_title
      );
    END LOOP;
  END LOOP;
END $$;

-- Reference data: vaccination protocol details for the UI to surface
-- per-disease info (recommended dose, withdrawal period, common brand
-- names in Africa). Stored as a JSON-friendly table so the app can read
-- it without hardcoding.
CREATE TABLE IF NOT EXISTS public.species_vaccination_protocols (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species         text NOT NULL CHECK (species IN ('poultry', 'aquaculture', 'rabbits', 'cattle', 'goats', 'sheep')),
  disease_name    text NOT NULL,
  scientific_name text,
  primary_age     text,         -- e.g. "8 weeks"
  booster_freq    text,         -- e.g. "every 6 months"
  recommended_dose text,
  withdrawal_period_days integer,
  common_brands   text[],
  notes           text,
  is_required     boolean DEFAULT true,
  display_order   integer DEFAULT 0,
  UNIQUE (species, disease_name)
);

ALTER TABLE public.species_vaccination_protocols ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS species_vacc_protocols_read_all ON public.species_vaccination_protocols;
CREATE POLICY species_vacc_protocols_read_all ON public.species_vaccination_protocols
  FOR SELECT USING (true);  -- reference data, readable by any authenticated user

-- Seed the rabbit protocol rows
INSERT INTO public.species_vaccination_protocols (species, disease_name, scientific_name, primary_age, booster_freq, recommended_dose, withdrawal_period_days, common_brands, notes, is_required, display_order)
VALUES
  ('rabbits', 'Myxomatosis', 'Myxoma virus',
   '8 weeks', 'every 6 months', '0.5 ml subcutaneous', 21,
   ARRAY['Filavac VHD K C+V', 'Cunipravac RHD', 'Nobivac Myxo-RHD'],
   'Critical in regions with wild rabbit/hare populations. Two-week reaction window after vaccination — separate freshly-vaccinated stock from naive does about to kindle.',
   true, 10),
  ('rabbits', 'RHD (Rabbit Haemorrhagic Disease)', 'RHDV1 / RHDV2',
   '10-12 weeks', 'annually', '0.5 ml subcutaneous', 21,
   ARRAY['Filavac VHD K C+V', 'Cunipravac RHD'],
   'RHDV2 increasingly common; use a combined vaccine where available. Mortality without vaccination can hit 90%+ in an outbreak.',
   true, 20),
  ('rabbits', 'Pasteurellosis (snuffles)', 'Pasteurella multocida',
   'as needed', 'risk-based', 'consult vet', 14,
   ARRAY['Pastormone', 'autogenous'],
   'Endemic in many African herds. Vaccination is risk-based — most operations rely on culling carriers + biosecurity rather than routine vaccination.',
   false, 30)
ON CONFLICT (species, disease_name) DO NOTHING;
