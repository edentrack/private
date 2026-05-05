/*
  # Stub broken RPC + add rabbits as a farm type

  1. Stub generate_task_instances_for_date as a no-op returning 0.
     The function references columns that don't exist (frequency, custom_interval_days,
     start_date on task_templates; scope = 'farm' invalid enum; v_template.name instead
     of title). Client-side ensureTasksGeneratedForDate owns real task generation, so
     this function is dead code. Replacing with a no-op removes the runtime error without
     breaking anything.

  2. Extend farms.farm_type CHECK constraint to allow 'rabbits'.

  3. Add rabbits branch to create_system_task_templates (seeds rabbit-specific daily
     and weekly task templates when a rabbits farm is created).

  4. Add rabbits branch to seed_default_feed_inventory (seeds rabbit feed stock rows).
*/

-- ── 1. Stub broken RPC ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_task_instances_for_date(
  p_farm_id uuid,
  p_date date,
  p_flock_id uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
AS $$
BEGIN
  -- Dead code: client-side ensureTasksGeneratedForDate handles task generation.
  -- Prior implementation referenced non-existent columns; stubbed to avoid errors.
  RETURN 0;
END;
$$;


-- ── 2. Extend farm_type CHECK constraint ────────────────────────────────────

ALTER TABLE farms DROP CONSTRAINT IF EXISTS farms_farm_type_check;
ALTER TABLE farms ADD CONSTRAINT farms_farm_type_check
  CHECK (farm_type IN ('poultry', 'aquaculture', 'rabbits'));


-- ── 3. Extend create_system_task_templates with rabbits branch ──────────────

CREATE OR REPLACE FUNCTION create_system_task_templates(p_farm_id uuid)
RETURNS void AS $$
DECLARE
  v_template_exists boolean;
  v_farm_type text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM task_templates
    WHERE farm_id = p_farm_id AND is_system_template = true
    LIMIT 1
  ) INTO v_template_exists;

  -- Always try to seed default feed types (idempotent)
  PERFORM seed_default_feed_inventory(p_farm_id);

  IF v_template_exists THEN
    RETURN;
  END IF;

  SELECT COALESCE(farm_type, 'poultry') INTO v_farm_type
  FROM farms WHERE id = p_farm_id;

  -- ── Aquaculture templates ──────────────────────────────────────────────────
  IF v_farm_type = 'aquaculture' THEN
    INSERT INTO task_templates (
      farm_id, title, description, category, is_data_task,
      default_frequency, is_active, is_enabled, task_type,
      requires_input, scope, type_category, is_system_template,
      flock_type_filter, display_order, icon, input_fields
    ) VALUES
    (p_farm_id, 'Check water DO morning', 'Measure dissolved oxygen at dawn before feeding', 'Water Quality', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 10, 'droplets',
     '{"fields": [{"name": "do_mgl", "type": "number", "label": "DO (mg/L)", "required": true, "min": 0, "step": 0.1}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Check water DO evening', 'Measure dissolved oxygen in the afternoon', 'Water Quality', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 20, 'droplets',
     '{"fields": [{"name": "do_mgl", "type": "number", "label": "DO (mg/L)", "required": true, "min": 0, "step": 0.1}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Feed pond', 'Record feed dispensed to pond today', 'Feed Management', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 30, 'package',
     '{"fields": [{"name": "feed_kg", "type": "number", "label": "Feed amount (kg)", "required": true, "min": 0, "step": 0.1}, {"name": "feed_type", "type": "text", "label": "Feed type", "required": false}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Inspect pond for deaths', 'Scoop and count any dead fish, log cause', 'Health', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 40, 'alert-triangle',
     '{"fields": [{"name": "count", "type": "number", "label": "Dead fish found", "required": true, "min": 0, "default": 0}, {"name": "cause", "type": "select", "label": "Likely cause", "required": false, "options": ["Low DO","Ammonia","Disease","Predation","Unknown","Other"]}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Check ammonia and nitrite', 'Test ammonia-N and nitrite-N levels', 'Water Quality', true,
     'weekly', true, true, 'data', true, 'general', 'recording', true, null, 50, 'flask',
     '{"fields": [{"name": "ammonia_mgl", "type": "number", "label": "Ammonia NH₃ (mg/L)", "required": true, "min": 0, "step": 0.001}, {"name": "nitrite_mgl", "type": "number", "label": "Nitrite NO₂ (mg/L)", "required": true, "min": 0, "step": 0.01}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Sample weight (5–10 fish)', 'Weigh a random sample to calculate ABW', 'Growth Tracking', true,
     'weekly', true, true, 'data', true, 'general', 'recording', true, null, 60, 'scale',
     '{"fields": [{"name": "sample_size", "type": "number", "label": "Fish weighed", "required": true, "min": 5}, {"name": "total_weight_g", "type": "number", "label": "Total weight (g)", "required": true, "min": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Pond clean / partial water change', 'Remove 20–30% water and replace with fresh', 'Sanitation', false,
     'monthly', true, true, 'checklist', false, 'general', 'one_time', true, null, 70, 'droplets',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Health inspection', 'Observe fish behaviour, check for parasites or lesions', 'Health', false,
     'monthly', true, true, 'checklist', false, 'general', 'one_time', true, null, 80, 'shield',
     '{"fields": []}'::jsonb);

  -- ── Rabbits templates ──────────────────────────────────────────────────────
  ELSIF v_farm_type = 'rabbits' THEN
    INSERT INTO task_templates (
      farm_id, title, description, category, is_data_task,
      default_frequency, is_active, is_enabled, task_type,
      requires_input, scope, type_category, is_system_template,
      flock_type_filter, display_order, icon, input_fields
    ) VALUES
    (p_farm_id, 'Feed rabbits', 'Dispense pellets and hay to all hutches', 'Feed Management', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 10, 'package',
     '{"fields": [{"name": "pellets_g", "type": "number", "label": "Pellets (g per rabbit)", "required": true, "min": 0, "step": 5}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Check water supply', 'Inspect and refill water bottles or nipples', 'Maintenance', false,
     'once_per_day', true, true, 'checklist', false, 'general', 'daily', true, null, 20, 'droplets',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Inspect hutches for health issues', 'Check for discharge, lethargy, diarrhoea, bloat', 'Health', false,
     'once_per_day', true, true, 'checklist', false, 'general', 'daily', true, null, 30, 'eye',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Record deaths', 'Log any rabbit deaths and cause', 'Health', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 40, 'alert-triangle',
     '{"fields": [{"name": "count", "type": "number", "label": "Deaths", "required": true, "min": 0, "default": 0}, {"name": "cause", "type": "select", "label": "Cause", "required": false, "options": ["Disease","Injury","Stress","Heat","Predation","Pasteurella","Coccidiosis","Unknown","Other"]}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Clean hutches', 'Remove droppings, replace bedding, sanitise', 'Sanitation', false,
     'weekly', true, true, 'checklist', false, 'general', 'one_time', true, null, 50, 'broom',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Weight sampling', 'Weigh 5–10 rabbits and record average body weight', 'Growth Tracking', true,
     'weekly', true, true, 'data', true, 'general', 'recording', true, null, 60, 'scale',
     '{"fields": [{"name": "sample_size", "type": "number", "label": "Rabbits weighed", "required": true, "min": 1}, {"name": "avg_weight_g", "type": "number", "label": "Average weight (g)", "required": true, "min": 0, "step": 10}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb);

  -- ── Poultry templates (default) ───────────────────────────────────────────
  ELSE
    INSERT INTO task_templates (
      farm_id, title, description, category, is_data_task,
      default_frequency, is_active, is_enabled, task_type,
      requires_input, scope, type_category, is_system_template,
      flock_type_filter, display_order, icon, input_fields
    ) VALUES
    (p_farm_id, 'Clean Coop', 'Daily cleaning and sanitation of the coop', 'Sanitation', false,
     'once_per_day', true, true, 'checklist', false, 'general', 'daily', true, null, 10, 'broom',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Check Water Lines', 'Inspect and clean water lines and nipples', 'Maintenance', false,
     'once_per_day', true, true, 'checklist', false, 'general', 'daily', true, null, 20, 'droplets',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Inspect Feeders', 'Check feeder function and cleanliness', 'Maintenance', false,
     'once_per_day', true, true, 'checklist', false, 'general', 'daily', true, null, 30, 'utensils',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Biosecurity Check', 'Complete daily biosecurity checklist', 'Biosecurity', false,
     'once_per_day', true, true, 'checklist', false, 'general', 'daily', true, null, 40, 'shield',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Record Mortality', 'Log any bird deaths and causes', 'Health', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 50, 'alert-triangle',
     '{"fields": [{"name": "count", "type": "number", "label": "Number of Deaths", "required": true, "min": 0}, {"name": "reason", "type": "select", "label": "Cause", "required": true, "options": ["Disease", "Injury", "Unknown", "Predator", "Other"]}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Daily Feed Usage', 'Record feed consumed today', 'Feed Management', true,
     'once_per_day', true, true, 'data', true, 'broiler', 'recording', true, 'Broiler', 60, 'package',
     '{"fields": [{"name": "feed_type", "type": "select", "label": "Feed Type", "required": true, "options_source": "feed_stock"}, {"name": "amount_kg", "type": "number", "label": "Amount (kg)", "required": true, "min": 0, "step": 0.1}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Weekly Broiler Weight Check', 'Weigh sample birds and record average weight', 'Growth Tracking', true,
     'weekly', true, true, 'data', true, 'broiler', 'recording', true, 'Broiler', 70, 'scale',
     '{"fields": [{"name": "sample_size", "type": "number", "label": "Birds Weighed", "required": true, "min": 1}, {"name": "total_weight", "type": "number", "label": "Total Weight (g)", "required": true, "min": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Daily Egg Collection', 'Collect and count eggs from all nests', 'Egg Production', true,
     'multiple_per_day', true, true, 'data', true, 'layer', 'recording', true, 'Layer', 80, 'egg',
     '{"fields": [{"name": "trays_collected", "type": "number", "label": "Trays Collected", "required": true, "min": 0}, {"name": "broken_eggs", "type": "number", "label": "Broken Eggs", "required": false, "min": 0, "default": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Weekly Layer Body Weight', 'Weigh sample layers and calculate ABW', 'Growth Tracking', true,
     'weekly', true, true, 'data', true, 'layer', 'recording', true, 'Layer', 90, 'scale',
     '{"fields": [{"name": "birds_weighed", "type": "number", "label": "Number of Birds Weighed", "required": true, "min": 1}, {"name": "total_weight_grams", "type": "number", "label": "Total Weight (grams)", "required": true, "min": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb);

  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 4. Extend seed_default_feed_inventory with rabbits branch ────────────────

CREATE OR REPLACE FUNCTION seed_default_feed_inventory(p_farm_id uuid)
RETURNS void AS $$
DECLARE
  v_farm_type text;
  v_already_seeded boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM feed_types WHERE farm_id = p_farm_id LIMIT 1
  ) INTO v_already_seeded;

  IF v_already_seeded THEN
    RETURN;
  END IF;

  SELECT COALESCE(farm_type, 'poultry') INTO v_farm_type
  FROM farms WHERE id = p_farm_id;

  IF v_farm_type = 'aquaculture' THEN
    WITH inserted AS (
      INSERT INTO feed_types (farm_id, name, unit, description) VALUES
        (p_farm_id, 'Catfish Starter (50% protein)', 'kg',
         'For fingerlings 0-50g. High-protein floating pellets, 2-3mm.'),
        (p_farm_id, 'Catfish Grower (40% protein)', 'kg',
         'For grow-out fish 50-500g. Medium-protein floating pellets, 4-6mm.'),
        (p_farm_id, 'Catfish Finisher (35% protein)', 'kg',
         'For pre-harvest fish 500g+. Lower-protein, larger pellets, 6-8mm.'),
        (p_farm_id, 'Tilapia Starter (40% protein)', 'kg',
         'For tilapia fingerlings 0-30g. Sinking or floating, 2-3mm.'),
        (p_farm_id, 'Tilapia Grower (32% protein)', 'kg',
         'For tilapia grow-out 30-300g. Medium pellets, 4-5mm.'),
        (p_farm_id, 'Tilapia Finisher (28% protein)', 'kg',
         'For tilapia pre-harvest 300g+. Larger pellets, 5-6mm.')
      RETURNING id
    )
    INSERT INTO feed_inventory (farm_id, feed_type_id, quantity)
    SELECT p_farm_id, id, 0 FROM inserted;

  ELSIF v_farm_type = 'rabbits' THEN
    WITH inserted AS (
      INSERT INTO feed_types (farm_id, name, unit, description) VALUES
        (p_farm_id, 'Rabbit Pellets', 'kg',
         'Balanced commercial pellets. ~100-150g per adult rabbit per day.'),
        (p_farm_id, 'Hay / Roughage', 'bales',
         'Timothy or grass hay. Unlimited access; essential for gut health.'),
        (p_farm_id, 'Grower Concentrate', 'kg',
         'High-protein concentrate for kits and growing rabbits 4-12 weeks.')
      RETURNING id
    )
    INSERT INTO feed_inventory (farm_id, feed_type_id, quantity)
    SELECT p_farm_id, id, 0 FROM inserted;

  ELSE
    -- Poultry default
    WITH inserted AS (
      INSERT INTO feed_types (farm_id, name, unit, description) VALUES
        (p_farm_id, 'Chick Starter', 'bags',
         'Day-old to week 4. High protein for broilers and pullets.'),
        (p_farm_id, 'Grower Mash', 'bags',
         'Week 5 to point of lay (layers) or grow-out (broilers).'),
        (p_farm_id, 'Layer Mash', 'bags',
         'For laying hens from point of lay onwards. Calcium-enriched.'),
        (p_farm_id, 'Broiler Finisher', 'bags',
         'Week 5 to harvest. High-energy for fast weight gain.')
      RETURNING id
    )
    INSERT INTO feed_inventory (farm_id, feed_type_id, quantity)
    SELECT p_farm_id, id, 0 FROM inserted;
  END IF;
END;
$$ LANGUAGE plpgsql;
