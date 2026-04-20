/*
  # Fix Tasks Table Missing Columns

  1. Changes
    - Add due_date column (code expects this for filtering)
    - Add other missing columns that might be needed

  Note: Code filters by due_date but it doesn't exist in the table
*/

-- Add missing columns to tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE tasks ADD COLUMN due_date date;
    -- Set due_date to the date portion of scheduled_for for existing tasks
    UPDATE tasks SET due_date = scheduled_for::date WHERE scheduled_for IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'scheduled_time'
  ) THEN
    ALTER TABLE tasks ADD COLUMN scheduled_time time;
    -- Extract time from scheduled_for for existing tasks
    UPDATE tasks SET scheduled_time = scheduled_for::time WHERE scheduled_for IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE tasks ADD COLUMN assigned_to uuid REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'notes'
  ) THEN
    ALTER TABLE tasks ADD COLUMN notes text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;