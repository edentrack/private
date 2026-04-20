/*
  # Add Target Notes to Flock Cycles

  1. Changes
    - Add `target_reached_notes` column to `flock_cycles` table
    - This field stores what should happen when the production cycle reaches its target week
    - Examples: "Sell birds", "Start molting process", "Schedule processing"

  2. Notes
    - Field is optional (nullable)
    - Text type for flexible note content
*/

ALTER TABLE flock_cycles
ADD COLUMN IF NOT EXISTS target_reached_notes text;

COMMENT ON COLUMN flock_cycles.target_reached_notes IS 'Notes describing what should happen when the target week is reached';
