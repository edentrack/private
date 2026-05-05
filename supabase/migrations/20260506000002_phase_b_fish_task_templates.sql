-- Phase B Step 23: expand fish-specific task templates.
--
-- Aquaculture today has ~8 default tasks. Fish farmers actually need a
-- richer routine: net cleaning, sample weighing, water exchange, biosecurity,
-- harvest preparation. This migration seeds the additional tasks for any
-- existing aquaculture farm AND ensures new aquaculture farms get them too
-- via the seeding RPC.
--
-- Safe to re-run: every INSERT is gated by NOT EXISTS on (farm_id, title)
-- so duplicates are impossible.

DO $$
DECLARE
  fish_farm_id uuid;
BEGIN
  FOR fish_farm_id IN
    SELECT id FROM public.farms WHERE farm_type = 'aquaculture'
  LOOP

    -- Daily tasks
    INSERT INTO public.task_templates (
      farm_id, title, description, category, default_frequency,
      is_active, is_enabled, task_type, requires_input, scope,
      type_category, is_system_template, display_order
    )
    SELECT fish_farm_id, t.title, t.description, t.category, 'once_per_day',
           true, true, 'checklist', false, 'general'::task_scope,
           'daily', true, t.ord
    FROM (VALUES
      (10, 'Check water DO morning',           'Measure dissolved oxygen at dawn before feeding',               'Water Quality'),
      (20, 'Check water DO evening',           'Measure dissolved oxygen in the afternoon',                     'Water Quality'),
      (30, 'Inspect pond for distressed fish', 'Scan pond surface and edges for abnormal fish behaviour',       'Health'),
      (40, 'Feed pond morning',                'Dispense morning ration — adjust based on appetite',            'Feed Management'),
      (50, 'Feed pond afternoon',              'Dispense afternoon ration — observe for uneaten feed',          'Feed Management'),
      (60, 'Net pond surface (debris)',        'Remove floating waste, dead leaves, and surface debris',        'Maintenance')
    ) AS t(ord, title, description, category)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_templates
      WHERE farm_id = fish_farm_id AND title = t.title
    );

    -- Weekly tasks
    INSERT INTO public.task_templates (
      farm_id, title, description, category, default_frequency,
      is_active, is_enabled, task_type, requires_input, scope,
      type_category, is_system_template, display_order
    )
    SELECT fish_farm_id, t.title, t.description, t.category, 'once_per_day',
           true, true, 'checklist', false, 'general'::task_scope,
           'one_time', true, t.ord
    FROM (VALUES
      (110, 'Test ammonia and nitrite',          'Use test kit; target ammonia < 0.5 mg/L, nitrite < 0.2 mg/L',  'Water Quality'),
      (120, 'Test pH and temperature',           'pH 6.5–8.5, temperature within species range',                 'Water Quality'),
      (130, 'Sample weight (5–10 fish)',         'Weigh a random sample to track growth rate',                   'Production'),
      (140, 'Inspect fish for parasites/lesions','Look for spots, fin damage, unusual slime, or erratic swimming','Health'),
      (150, 'Check feed stock + reorder',        'Confirm remaining bags; reorder if below minimum buffer',       'Inventory')
    ) AS t(ord, title, description, category)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_templates
      WHERE farm_id = fish_farm_id AND title = t.title
    );

    -- Monthly tasks
    INSERT INTO public.task_templates (
      farm_id, title, description, category, default_frequency,
      is_active, is_enabled, task_type, requires_input, scope,
      type_category, is_system_template, display_order
    )
    SELECT fish_farm_id, t.title, t.description, t.category, 'once_per_day',
           true, true, 'checklist', false, 'general'::task_scope,
           'one_time', true, t.ord
    FROM (VALUES
      (210, 'Pond partial water exchange',    'Replace 20–30% of pond volume; replenish dechlorinated water',   'Maintenance'),
      (220, 'Disinfect nets and equipment',  'Soak nets in potassium permanganate solution; rinse and dry',     'Biosecurity'),
      (230, 'Stocking density review',       'Calculate kg/m³; thin stock or expand pond if overcrowded',       'Production'),
      (240, 'Harvest readiness assessment',  'Sample 10 fish; compare average weight against target market size','Production')
    ) AS t(ord, title, description, category)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_templates
      WHERE farm_id = fish_farm_id AND title = t.title
    );

  END LOOP;
END $$;
