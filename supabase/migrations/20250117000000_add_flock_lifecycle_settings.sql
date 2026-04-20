/*
  # Add Flock Lifecycle Settings

  This migration adds fields to the farms table to configure:
  - Total duration a flock stays in the farm (in weeks)
  - Animal phases configuration (JSONB) for different flock types

  Fields added:
  - broiler_total_duration_weeks: Total weeks broilers stay in farm
  - layer_total_duration_weeks: Total weeks layers stay in farm
  - broiler_phases: JSONB array of phases with week ranges and feed types
  - layer_phases: JSONB array of phases with week ranges and feed types
*/

DO $$
BEGIN
  -- Add broiler total duration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'broiler_total_duration_weeks'
  ) THEN
    ALTER TABLE farms ADD COLUMN broiler_total_duration_weeks INTEGER DEFAULT 8;
  END IF;

  -- Add layer total duration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'layer_total_duration_weeks'
  ) THEN
    ALTER TABLE farms ADD COLUMN layer_total_duration_weeks INTEGER DEFAULT 72;
  END IF;

  -- Add broiler phases configuration (JSONB)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'broiler_phases'
  ) THEN
    ALTER TABLE farms ADD COLUMN broiler_phases JSONB DEFAULT '[
      {"name": "Brooding", "startWeek": 1, "endWeek": 2, "feedType": "Starter"},
      {"name": "Growth", "startWeek": 3, "endWeek": 4, "feedType": "Grower"},
      {"name": "Finishing", "startWeek": 5, "endWeek": 8, "feedType": "Finisher"}
    ]'::jsonb;
  END IF;

  -- Add layer phases configuration (JSONB)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'layer_phases'
  ) THEN
    ALTER TABLE farms ADD COLUMN layer_phases JSONB DEFAULT '[
      {"name": "Chick", "startWeek": 1, "endWeek": 5, "feedType": "Starter"},
      {"name": "Grower", "startWeek": 6, "endWeek": 12, "feedType": "Grower"},
      {"name": "Pullet", "startWeek": 13, "endWeek": 17, "feedType": "Developer"},
      {"name": "Pre-lay", "startWeek": 18, "endWeek": 20, "feedType": "Pre-layer"},
      {"name": "Laying", "startWeek": 21, "endWeek": 72, "feedType": "Layer mash"}
    ]'::jsonb;
  END IF;
END $$;
