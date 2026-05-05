/*
  # Seed default feed types per species when a farm is created

  Problem: The Daily Inventory Usage widget on the dashboard pulls from
  `feed_inventory` joined with `feed_types`. New farms (any species) start
  with both tables empty for that farm, so the widget renders only the
  synthetic "Water" item until the user manually adds a feed type via the
  Inventory page. This is especially jarring for fish farms (Riverside)
  because the rest of the fish module is auto-set-up (task templates,
  knowledge file, etc.).

  Fix: Extend the existing on-farm-INSERT seeding path to also seed a
  small set of default feed types (and their feed_inventory rows at
  quantity = 0) tailored to the farm's `farm_type`. Users adjust stock
  when they actually buy feed.

  - Aquaculture farms get catfish + tilapia feed lines (each with starter,
    grower, finisher protein bands).
  - Poultry farms get chick starter, grower, layer mash, broiler finisher.
  - Other future species can extend this function.

  Idempotent: skips seeding if any feed_types already exist for the farm.
  Additive only — no table renames, no column drops.
*/

CREATE OR REPLACE FUNCTION seed_default_feed_inventory(p_farm_id uuid)
RETURNS void AS $$
DECLARE
  v_farm_type text;
  v_already_seeded boolean;
BEGIN
  -- Skip if any feed types already exist for this farm (idempotent)
  SELECT EXISTS(
    SELECT 1 FROM feed_types WHERE farm_id = p_farm_id LIMIT 1
  ) INTO v_already_seeded;

  IF v_already_seeded THEN
    RETURN;
  END IF;

  -- Read the farm's species
  SELECT COALESCE(farm_type, 'poultry') INTO v_farm_type
  FROM farms WHERE id = p_farm_id;

  -- Insert species-appropriate feed types and matching empty inventory rows.
  -- We use a CTE pattern so each feed_type gets a paired feed_inventory row.

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

  ELSE
    -- Poultry default (broiler + layer covers most cases; mixed farms get all)
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


-- Hook into the existing farm-creation trigger by extending the system-template seeder
-- to also call seed_default_feed_inventory. This keeps the trigger signature unchanged.

CREATE OR REPLACE FUNCTION create_system_task_templates(p_farm_id uuid)
RETURNS void AS $$
DECLARE
  v_template_exists boolean;
  v_farm_type text;
BEGIN
  -- Skip if templates already seeded for this farm
  SELECT EXISTS(
    SELECT 1 FROM task_templates
    WHERE farm_id = p_farm_id AND is_system_template = true
    LIMIT 1
  ) INTO v_template_exists;

  -- Always try to seed default feed types (the function itself is idempotent)
  PERFORM seed_default_feed_inventory(p_farm_id);

  IF v_template_exists THEN
    RETURN;
  END IF;

  SELECT COALESCE(farm_type, 'poultry') INTO v_farm_type
  FROM farms WHERE id = p_farm_id;

  -- ── Aquaculture templates ──────────────────────────────────────────────
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

    (p_farm_id, 'Sample weight (5–10 fish)', 'Net 5-10 fish, weigh them, record average', 'Health', true,
     'weekly', true, true, 'data', true, 'general', 'recording', true, null, 60, 'scale',
     '{"fields": [{"name": "abw_g", "type": "number", "label": "Average body weight (g)", "required": true, "min": 0, "step": 0.1}, {"name": "sample_size", "type": "number", "label": "Number of fish weighed", "required": true, "min": 1}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Pond clean / partial water change', 'Periodic pond maintenance', 'Maintenance', false,
     'monthly', true, true, 'standard', false, 'general', 'one_time', true, null, 70, 'droplets',
     '{}'::jsonb),

    (p_farm_id, 'Health inspection', 'Walk the pond, observe fish behaviour and body condition', 'Health', false,
     'monthly', true, true, 'standard', false, 'general', 'one_time', true, null, 80, 'eye',
     '{}'::jsonb);

  ELSE
    -- Poultry templates (existing set, unchanged)
    INSERT INTO task_templates (
      farm_id, title, description, category, is_data_task,
      default_frequency, is_active, is_enabled, task_type,
      requires_input, scope, type_category, is_system_template,
      flock_type_filter, display_order, icon, input_fields
    ) VALUES
    (p_farm_id, 'Clean Coop', 'Daily coop cleanup', 'Maintenance', false,
     'once_per_day', true, true, 'standard', false, 'general', 'daily', true, null, 10, 'broom', '{}'::jsonb),
    (p_farm_id, 'Check Water Lines', 'Inspect water delivery system', 'Water', false,
     'once_per_day', true, true, 'standard', false, 'general', 'daily', true, null, 20, 'droplets', '{}'::jsonb),
    (p_farm_id, 'Inspect Feeders', 'Check feeders for blockages and refill', 'Feed Management', false,
     'once_per_day', true, true, 'standard', false, 'general', 'daily', true, null, 30, 'package', '{}'::jsonb),
    (p_farm_id, 'Biosecurity Check', 'Verify biosecurity protocols', 'Health', false,
     'once_per_day', true, true, 'standard', false, 'general', 'daily', true, null, 40, 'shield', '{}'::jsonb),
    (p_farm_id, 'Record Mortality', 'Count and log any dead birds', 'Health', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 50, 'alert-triangle',
     '{"fields": [{"name": "count", "type": "number", "label": "Dead birds", "required": true, "min": 0, "default": 0}, {"name": "cause", "type": "select", "label": "Likely cause", "required": false, "options": ["Disease","Heat","Cold","Predation","Injury","Cannibalism","Unknown","Other"]}]}'::jsonb),
    (p_farm_id, 'Daily Feed Usage', 'Record feed dispensed today', 'Feed Management', true,
     'once_per_day', true, true, 'data', true, 'general', 'recording', true, null, 60, 'package',
     '{"fields": [{"name": "feed_kg", "type": "number", "label": "Feed (kg)", "required": true, "min": 0, "step": 0.1}]}'::jsonb),
    (p_farm_id, 'Daily Egg Collection', 'Collect and count eggs', 'Production', true,
     'multiple_times_per_day', true, true, 'data', true, 'layer', 'recording', true, 'Layer', 70, 'egg',
     '{}'::jsonb),
    (p_farm_id, 'Weekly Broiler Weight Check', 'Weigh sample of broilers', 'Health', true,
     'weekly', true, true, 'data', true, 'broiler', 'recording', true, 'Broiler', 80, 'scale',
     '{"fields": [{"name": "avg_weight_kg", "type": "number", "label": "Average weight (kg)", "required": true, "min": 0, "step": 0.01}, {"name": "sample_size", "type": "number", "label": "Number weighed", "required": true, "min": 1}]}'::jsonb),
    (p_farm_id, 'Litter Condition Check', 'Inspect litter dryness and odour', 'Maintenance', false,
     'weekly', true, true, 'standard', false, 'general', 'one_time', true, null, 90, 'eye', '{}'::jsonb);
  END IF;
END;
$$ LANGUAGE plpgsql;
