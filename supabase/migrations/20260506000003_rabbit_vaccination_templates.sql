-- Phase C — Rabbit vaccination schedule template seed.
--
-- Seeds the standard RHD + Myxomatosis vaccination schedule and core
-- rabbit husbandry tasks onto every rabbit farm.
--
-- Standard protocol (WSAVA + East/West/Central Africa vet guidelines):
--   Myxomatosis: primary at 8 wks, booster every 6 months
--   RHD (RHDV1+2): primary at 10-12 wks, booster every 12 months
--   Pre-mating booster: 2 weeks before mating all does
--   Rainy-season booster: when vector pressure peaks
--
-- Idempotent — every INSERT is gated by NOT EXISTS on (farm_id, title).

DO $$
DECLARE
  rabbit_farm_id uuid;
BEGIN
  FOR rabbit_farm_id IN
    SELECT id FROM public.farms WHERE farm_type = 'rabbits'
  LOOP

    -- Daily tasks
    INSERT INTO public.task_templates (
      farm_id, title, description, category, default_frequency,
      is_active, is_enabled, task_type, requires_input, scope,
      type_category, is_system_template, display_order
    )
    SELECT rabbit_farm_id, t.title, t.description, t.category, 'once_per_day',
           true, true, 'checklist', false, 'general'::task_scope,
           'daily', true, t.ord
    FROM (VALUES
      (10, 'Inspect rabbits for snuffles / ear mites', 'Check nostrils, ears, and coat for signs of infection or parasites',     'Health'),
      (20, 'Check water nipples + refill',             'Confirm each cage nipple flows freely; refill reservoirs as needed',      'Husbandry'),
      (30, 'Feed pellets + greens',                    'Dispense measured pellet ration; supplement with fresh greens/hay',       'Feeding'),
      (40, 'Spot-clean droppings tray',                'Remove soiled litter from trays to prevent ammonia build-up',             'Husbandry')
    ) AS t(ord, title, description, category)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_templates
      WHERE farm_id = rabbit_farm_id AND title = t.title
    );

    -- Weekly tasks
    INSERT INTO public.task_templates (
      farm_id, title, description, category, default_frequency,
      is_active, is_enabled, task_type, requires_input, scope,
      type_category, is_system_template, display_order
    )
    SELECT rabbit_farm_id, t.title, t.description, t.category, 'once_per_day',
           true, true, 'checklist', false, 'general'::task_scope,
           'one_time', true, t.ord
    FROM (VALUES
      (110, 'Weight sample (5-10 kits/grow-outs)', 'Weigh random sample; track FCR and flag underperformers',              'Production'),
      (120, 'Check breeding doe condition',         'Body condition score each doe; note any that are too thin/heavy',       'Breeding'),
      (130, 'Sanitise hutches + nest boxes',        'Scrub with approved disinfectant; remove nesting material from weaned kits', 'Biosecurity')
    ) AS t(ord, title, description, category)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_templates
      WHERE farm_id = rabbit_farm_id AND title = t.title
    );

    -- Monthly / periodic tasks (vaccination + biosecurity)
    INSERT INTO public.task_templates (
      farm_id, title, description, category, default_frequency,
      is_active, is_enabled, task_type, requires_input, scope,
      type_category, is_system_template, display_order
    )
    SELECT rabbit_farm_id, t.title, t.description, t.category, 'once_per_day',
           true, true, 'checklist', false, 'general'::task_scope,
           'one_time', true, t.ord
    FROM (VALUES
      (210, 'Myxomatosis primary vaccination (8 weeks)',    'First Myxoma vaccine — give at ~8 weeks of age per vet protocol',           'Vaccinations'),
      (220, 'Myxomatosis booster (6 months)',               '6-month Myxoma booster — schedule for entire herd on same day',             'Vaccinations'),
      (230, 'RHD primary vaccination (10-12 weeks)',        'First RHD/RHDV2 vaccine — give at 10-12 weeks; separate from Myxo by 2 wks', 'Vaccinations'),
      (240, 'RHD booster (annual)',                         'Annual RHD booster — schedule just before the main breeding season',         'Vaccinations'),
      (250, 'Pre-mating booster (2 weeks before)',          'Boost all breeding does and bucks 2 weeks before planned mating',           'Vaccinations'),
      (260, 'Rainy-season booster — vector pressure peak',  'Extra Myxo booster at start of rains when mosquito vectors peak',          'Vaccinations'),
      (270, 'Coccidiostat top-up if seasonal',              'Add coccidiostat to drinking water during wet/high-stress periods',         'Health'),
      (280, 'Doe-buck rotation review',                     'Review mating pairings; rotate bucks to prevent inbreeding',               'Breeding'),
      (290, 'Harvest readiness assessment',                 'Sample 10 grow-outs; compare live weight against market target (2-2.5 kg)', 'Production')
    ) AS t(ord, title, description, category)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_templates
      WHERE farm_id = rabbit_farm_id AND title = t.title
    );

  END LOOP;
END $$;
