/*
  # Fix Daily Tasks Limit Default to 15

  1. Changes
    - Update default value for `daily_tasks_per_flock` to 15
    - Update existing farms with value of 5 to use 15
  
  2. Purpose
    - Correct the default daily task limit per flock to 15 instead of 5
*/

ALTER TABLE farms ALTER COLUMN daily_tasks_per_flock SET DEFAULT 15;

UPDATE farms 
SET daily_tasks_per_flock = 15 
WHERE daily_tasks_per_flock = 5 OR daily_tasks_per_flock IS NULL;