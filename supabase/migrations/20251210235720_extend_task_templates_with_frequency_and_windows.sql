/*
  # Extend Task Templates with Frequency and Time Window Controls

  1. Schema Changes to `task_templates`
    - Add `frequency_mode` (text): 'once_per_day', 'multiple_times_per_day', 'ad_hoc'
    - Add `times_per_day` (integer): number of times per day for multiple mode
    - Add `scheduled_times` (jsonb): array of time strings like ["08:00", "14:00"]
    - Add `is_time_bound` (boolean): whether task has strict time window
    - Add `window_before_minutes` (integer): minutes before scheduled time allowed
    - Add `window_after_minutes` (integer): minutes after scheduled time allowed
    - Add `is_enabled` (boolean): whether template is active for auto-generation
    - Add `allowed_roles_to_complete` (text[]): roles that can complete this task
  
  2. Purpose
    - Enable owners/managers to configure task frequency and timing
    - Support once-per-day, multiple-per-day, and ad-hoc tasks
    - Allow time-window restrictions for worker completion
    - Enable/disable tasks without deleting templates
  
  3. Security
    - Maintains existing RLS policies on task_templates table
*/

-- Add frequency_mode field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'frequency_mode'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN frequency_mode text DEFAULT 'once_per_day';
    ALTER TABLE task_templates ADD CONSTRAINT task_templates_frequency_mode_check 
      CHECK (frequency_mode IN ('once_per_day', 'multiple_times_per_day', 'ad_hoc'));
  END IF;
END $$;

-- Add times_per_day field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'times_per_day'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN times_per_day integer;
  END IF;
END $$;

-- Add scheduled_times field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'scheduled_times'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN scheduled_times jsonb;
  END IF;
END $$;

-- Add is_time_bound field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'is_time_bound'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN is_time_bound boolean DEFAULT true;
  END IF;
END $$;

-- Add window_before_minutes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'window_before_minutes'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN window_before_minutes integer DEFAULT 60;
  END IF;
END $$;

-- Add window_after_minutes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'window_after_minutes'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN window_after_minutes integer DEFAULT 60;
  END IF;
END $$;

-- Add is_enabled field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN is_enabled boolean DEFAULT true;
  END IF;
END $$;

-- Add allowed_roles_to_complete field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'allowed_roles_to_complete'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN allowed_roles_to_complete text[] DEFAULT ARRAY['owner', 'manager', 'worker'];
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN task_templates.frequency_mode IS 'How often task occurs: once_per_day, multiple_times_per_day, or ad_hoc';
COMMENT ON COLUMN task_templates.times_per_day IS 'Number of times per day for multiple_times_per_day mode';
COMMENT ON COLUMN task_templates.scheduled_times IS 'Array of time strings (HH:MM format) when task should occur';
COMMENT ON COLUMN task_templates.is_time_bound IS 'Whether task has strict time window for completion';
COMMENT ON COLUMN task_templates.window_before_minutes IS 'Minutes before scheduled time when workers can complete';
COMMENT ON COLUMN task_templates.window_after_minutes IS 'Minutes after scheduled time when workers can complete';
COMMENT ON COLUMN task_templates.is_enabled IS 'Whether template actively generates daily tasks';
COMMENT ON COLUMN task_templates.allowed_roles_to_complete IS 'Roles permitted to complete this task';
