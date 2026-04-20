/*
  # Add arrival_date to flocks table

  1. Changes
    - Add `arrival_date` column to `flocks` table (date type, defaults to current date)
    - Backfill existing records to use their created_at date as arrival_date
  
  2. Notes
    - Existing flocks will have their arrival_date set to their creation date
    - New flocks will require an explicit arrival_date value
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'arrival_date'
  ) THEN
    ALTER TABLE flocks ADD COLUMN arrival_date date DEFAULT CURRENT_DATE;
    
    -- Backfill existing records with their created_at date
    UPDATE flocks SET arrival_date = created_at::date WHERE arrival_date IS NULL;
  END IF;
END $$;
