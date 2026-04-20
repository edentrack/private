/*
  # Extend Tasks with Scheduling and Completion Tracking

  1. Schema Changes to `tasks`
    - Add `template_id` (uuid): reference to task_templates for generated tasks
    - Add `scheduled_for` (date): date task is scheduled for
    - Add `scheduled_time` (time): time of day task is due
    - Add `is_time_bound` (boolean): snapshot from template
    - Add `window_before_minutes` (integer): snapshot from template
    - Add `window_after_minutes` (integer): snapshot from template
    - Add `completed_by_role` (text): role of user who completed task
  
  2. Indexes
    - Add composite index on (farm_id, scheduled_for) for efficient querying
    - Add composite index on (farm_id, template_id, scheduled_for) for upsert logic
  
  3. Purpose
    - Link tasks to templates for auto-generation
    - Track scheduling information for time-window enforcement
    - Record who completed tasks for accountability
  
  4. Security
    - Maintains existing RLS policies on tasks table
    - FK constraint with ON DELETE SET NULL for template_id
*/

-- Add template_id field with FK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN template_id uuid REFERENCES task_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add scheduled_for field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE tasks ADD COLUMN scheduled_for date;
  END IF;
END $$;

-- Add scheduled_time field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'scheduled_time'
  ) THEN
    ALTER TABLE tasks ADD COLUMN scheduled_time time;
  END IF;
END $$;

-- Add is_time_bound field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'is_time_bound'
  ) THEN
    ALTER TABLE tasks ADD COLUMN is_time_bound boolean DEFAULT false;
  END IF;
END $$;

-- Add window_before_minutes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'window_before_minutes'
  ) THEN
    ALTER TABLE tasks ADD COLUMN window_before_minutes integer DEFAULT 60;
  END IF;
END $$;

-- Add window_after_minutes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'window_after_minutes'
  ) THEN
    ALTER TABLE tasks ADD COLUMN window_after_minutes integer DEFAULT 60;
  END IF;
END $$;

-- Add completed_by_role field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'completed_by_role'
  ) THEN
    ALTER TABLE tasks ADD COLUMN completed_by_role text;
    ALTER TABLE tasks ADD CONSTRAINT tasks_completed_by_role_check 
      CHECK (completed_by_role IN ('owner', 'manager', 'worker') OR completed_by_role IS NULL);
  END IF;
END $$;

-- Create index on (farm_id, scheduled_for) if not exists
CREATE INDEX IF NOT EXISTS idx_tasks_farm_scheduled_for 
  ON tasks(farm_id, scheduled_for);

-- Create index on (farm_id, template_id, scheduled_for) if not exists
CREATE INDEX IF NOT EXISTS idx_tasks_farm_template_scheduled 
  ON tasks(farm_id, template_id, scheduled_for);

-- Create index on (farm_id, scheduled_for, scheduled_time) for time-based queries
CREATE INDEX IF NOT EXISTS idx_tasks_farm_scheduled_datetime 
  ON tasks(farm_id, scheduled_for, scheduled_time);

-- Add comments for documentation
COMMENT ON COLUMN tasks.template_id IS 'Reference to task_templates for auto-generated tasks';
COMMENT ON COLUMN tasks.scheduled_for IS 'Date this task instance is scheduled for';
COMMENT ON COLUMN tasks.scheduled_time IS 'Time of day this task is due (if time-bound)';
COMMENT ON COLUMN tasks.is_time_bound IS 'Whether task has strict completion window';
COMMENT ON COLUMN tasks.window_before_minutes IS 'Minutes before scheduled_time when completion allowed';
COMMENT ON COLUMN tasks.window_after_minutes IS 'Minutes after scheduled_time when completion allowed';
COMMENT ON COLUMN tasks.completed_by_role IS 'Role of user who completed this task';
