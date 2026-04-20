/*
  # Add Daily Tasks Limit Per Flock

  1. Changes
    - Add `daily_tasks_per_flock` column to farms table
    - Default value is 5 tasks per flock per day
    - This setting controls how many tasks are auto-generated per flock daily

  2. Purpose
    - Allows farms to configure maximum number of daily tasks per flock
    - Prevents task overload by limiting auto-generation
    - Provides better control over task management workflow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'daily_tasks_per_flock'
  ) THEN
    ALTER TABLE farms ADD COLUMN daily_tasks_per_flock integer DEFAULT 5;
  END IF;
END $$;