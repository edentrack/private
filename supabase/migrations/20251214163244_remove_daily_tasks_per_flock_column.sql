/*
  # Remove Daily Tasks Per Flock Column

  1. Changes
    - Drop `daily_tasks_per_flock` column from farms table
    - This feature is no longer needed in the application

  2. Purpose
    - Clean up unused database fields
    - Remove deprecated task generation limit feature
*/

ALTER TABLE farms DROP COLUMN IF EXISTS daily_tasks_per_flock;