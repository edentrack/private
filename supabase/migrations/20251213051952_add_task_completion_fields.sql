/*
  # Add completion fields to tasks table
  
  1. Changes
    - Add `completion_notes` column for storing notes when completing a task
    - Add `completion_photo_url` column for storing photo evidence
  
  2. Notes
    - Both columns are nullable as they're optional
*/

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS completion_notes text,
ADD COLUMN IF NOT EXISTS completion_photo_url text;
