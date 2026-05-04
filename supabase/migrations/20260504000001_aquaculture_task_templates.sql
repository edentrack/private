/*
  # Aquaculture Task Templates — Branch seeder by farm_type

  1. Replaces create_system_task_templates so it reads farm_type from the farms
     table and seeds the appropriate template set:
       - 'aquaculture' → pond monitoring + water quality + weight sampling
       - everything else → existing poultry set (unchanged)

  2. The trigger on_farm_created_create_templates is unchanged — it still fires
     on INSERT and calls create_system_task_templates(NEW.id). The function now
     reads farm_type internally so no trigger signature changes are needed.

  3. Additive only — no column drops, no table renames.

  --- Cleanup SQL (run once after deploy to remove chicken templates from
  --- existing aquaculture farms; adjust if you have renamed templates):
  --
  -- DELETE FROM task_templates
  -- WHERE farm_id IN (SELECT id FROM farms WHERE farm_type = 'aquaculture')
  --   AND is_system_template = true
  --   AND title IN (
  --     'Clean Coop','Check Water Lines','Inspect Feeders','Biosecurity Check',
  --     'Record Mortality','Daily Feed Usage','Weekly Broiler Weight Check',
  --     'Litter Condition Check','Harvest Readiness Check','Daily Egg Collection',
  --     'Weekly Layer Body Weight','Feed Intake Monitoring','Uniformity Check'
  --   );
  --
  -- (Tasks generated from those templates will already be orphaned once the
  -- templates are deleted; clean them up if you also track generated tasks.)
*/

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

  IF v_template_exists THEN
    RETURN;
  END IF;

  -- Derive species from farm_type
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
     'monthly', true, true, 'checklist', false, 'general', 'monthly', true, null, 70, 'droplets',
     '{"fields": []}'::jsonb),

    (p_farm_id, 'Health inspection', 'Observe fish behaviour, check for parasites or lesions', 'Health', false,
     'monthly', true, true, 'checklist', false, 'general', 'monthly', true, null, 80, 'shield',
     '{"fields": []}'::jsonb);

  -- ── Poultry templates (unchanged from original migration) ─────────────────
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
     '{"fields": [{"name": "feed_type", "type": "select", "label": "Feed Type", "required": true, "options_source": "feed_stock"}, {"name": "amount_kg", "type": "number", "label": "Amount (kg)", "required": true, "min": 0, "step": 0.1}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}], "inventory_update": {"table": "feed_stock", "operation": "decrease", "value_field": "amount_kg"}}'::jsonb),

    (p_farm_id, 'Weekly Broiler Weight Check', 'Weigh sample birds and record average weight', 'Growth Tracking', true,
     'weekly', true, true, 'data', true, 'broiler', 'recording', true, 'Broiler', 70, 'scale',
     '{"fields": [{"name": "sample_size", "type": "number", "label": "Birds Weighed", "required": true, "min": 1}, {"name": "total_weight", "type": "number", "label": "Total Weight (g)", "required": true, "min": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Litter Condition Check', 'Assess litter moisture and quality', 'Environment', false,
     'once_per_day', true, true, 'checklist', true, 'broiler', 'daily', true, 'Broiler', 80, 'layers',
     '{"fields": [{"name": "condition", "type": "select", "label": "Litter Condition", "required": true, "options": ["Dry", "Slightly Moist", "Wet", "Very Wet"]}, {"name": "action_taken", "type": "textarea", "label": "Action Taken", "required": false}]}'::jsonb),

    (p_farm_id, 'Harvest Readiness Check', 'Evaluate flock readiness for market', 'Production', true,
     'weekly', true, true, 'data', true, 'broiler', 'recording', true, 'Broiler', 90, 'truck',
     '{"fields": [{"name": "avg_weight_kg", "type": "number", "label": "Average Weight (kg)", "required": true, "min": 0, "step": 0.01}, {"name": "uniformity_percent", "type": "number", "label": "Uniformity (%)", "required": false, "min": 0, "max": 100}, {"name": "ready_for_harvest", "type": "select", "label": "Ready for Harvest?", "required": true, "options": ["Yes", "No", "Close"]}]}'::jsonb),

    (p_farm_id, 'Daily Egg Collection', 'Collect and count eggs from all nests', 'Egg Production', true,
     'multiple_per_day', true, true, 'data', true, 'layer', 'recording', true, 'Layer', 100, 'egg',
     '{"fields": [{"name": "trays_collected", "type": "number", "label": "Trays Collected", "required": true, "min": 0}, {"name": "broken_eggs", "type": "number", "label": "Broken Eggs", "required": false, "min": 0, "default": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}], "inventory_update": {"table": "egg_collections", "operation": "insert"}}'::jsonb),

    (p_farm_id, 'Weekly Layer Body Weight', 'Weigh sample layers and calculate ABW', 'Growth Tracking', true,
     'weekly', true, true, 'data', true, 'layer', 'recording', true, 'Layer', 110, 'scale',
     '{"fields": [{"name": "birds_weighed", "type": "number", "label": "Number of Birds Weighed", "required": true, "min": 1}, {"name": "total_weight_grams", "type": "number", "label": "Total Weight (grams)", "required": true, "min": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb),

    (p_farm_id, 'Feed Intake Monitoring', 'Record daily feed consumption for layers', 'Feed Management', true,
     'once_per_day', true, true, 'data', true, 'layer', 'recording', true, 'Layer', 120, 'package',
     '{"fields": [{"name": "feed_type", "type": "select", "label": "Feed Type", "required": true, "options_source": "feed_stock"}, {"name": "amount_kg", "type": "number", "label": "Amount (kg)", "required": true, "min": 0, "step": 0.1}, {"name": "birds_fed", "type": "number", "label": "Birds Fed", "required": false, "min": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}], "inventory_update": {"table": "feed_stock", "operation": "decrease", "value_field": "amount_kg"}}'::jsonb),

    (p_farm_id, 'Uniformity Check', 'Assess flock uniformity percentage', 'Growth Tracking', true,
     'weekly', true, true, 'data', true, 'layer', 'recording', true, 'Layer', 130, 'users',
     '{"fields": [{"name": "sample_size", "type": "number", "label": "Sample Size", "required": true, "min": 10}, {"name": "birds_within_range", "type": "number", "label": "Birds Within 10% of Mean", "required": true, "min": 0}, {"name": "notes", "type": "textarea", "label": "Notes", "required": false}]}'::jsonb);

  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
