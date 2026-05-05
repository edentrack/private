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
  templates_to_seed text[][];
  template_row text[];
  t_title text;
  t_freq text;
  t_category text;
  t_scope text;
BEGIN
  -- Each row: title, frequency, category, scope
  templates_to_seed := ARRAY[
    ARRAY['Check water DO morning',          'daily',   'Water Quality', 'aquaculture'],
    ARRAY['Check water DO evening',          'daily',   'Water Quality', 'aquaculture'],
    ARRAY['Inspect pond for distressed fish','daily',   'Health',        'aquaculture'],
    ARRAY['Feed pond morning',               'daily',   'Feeding',       'aquaculture'],
    ARRAY['Feed pond afternoon',             'daily',   'Feeding',       'aquaculture'],
    ARRAY['Net pond surface (debris)',       'daily',   'Maintenance',   'aquaculture'],
    ARRAY['Test ammonia and nitrite',        'weekly',  'Water Quality', 'aquaculture'],
    ARRAY['Test pH and temperature',         'weekly',  'Water Quality', 'aquaculture'],
    ARRAY['Sample weight (5–10 fish)',       'weekly',  'Production',    'aquaculture'],
    ARRAY['Inspect fish for parasites/lesions','weekly','Health',        'aquaculture'],
    ARRAY['Check feed stock + reorder',      'weekly',  'Inventory',     'aquaculture'],
    ARRAY['Pond partial water exchange',     'monthly', 'Maintenance',   'aquaculture'],
    ARRAY['Disinfect nets and equipment',    'monthly', 'Biosecurity',   'aquaculture'],
    ARRAY['Stocking density review',         'monthly', 'Production',    'aquaculture'],
    ARRAY['Harvest readiness assessment',    'monthly', 'Production',    'aquaculture']
  ];

  FOR fish_farm_id IN
    SELECT id FROM public.farms WHERE farm_type = 'aquaculture'
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
      SELECT fish_farm_id, t_title, t_freq, t_category, t_scope, true, true, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.task_templates
        WHERE farm_id = fish_farm_id AND title = t_title
      );
    END LOOP;
  END LOOP;
END $$;
