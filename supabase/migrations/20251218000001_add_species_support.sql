-- Migration: Add Multi-Species Support
-- Adds species field to flocks table and supports rabbits & aquaculture

-- Add species column (default to 'poultry' for existing records)
ALTER TABLE flocks 
  ADD COLUMN IF NOT EXISTS species VARCHAR(20) DEFAULT 'poultry';

-- Update existing records to ensure they're marked as poultry
UPDATE flocks 
SET species = 'poultry' 
WHERE species IS NULL OR species = '';

-- Add constraint for valid species
ALTER TABLE flocks 
  DROP CONSTRAINT IF EXISTS flocks_species_check;

ALTER TABLE flocks 
  ADD CONSTRAINT flocks_species_check 
  CHECK (species IN ('poultry', 'rabbits', 'aquaculture'));

-- For aquaculture, add optional fields
ALTER TABLE flocks
  ADD COLUMN IF NOT EXISTS pond_size_sqm NUMERIC,
  ADD COLUMN IF NOT EXISTS stocking_density NUMERIC;

-- Update type column to support new animal types
-- First, allow the new types
DO $$
BEGIN
  -- Check if we need to update the type constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'flocks_type_check' 
    AND table_name = 'flocks'
  ) THEN
    -- Drop old constraint
    ALTER TABLE flocks DROP CONSTRAINT flocks_type_check;
    
    -- Add new constraint with all types
    ALTER TABLE flocks ADD CONSTRAINT flocks_type_check
      CHECK (type IN (
        'Broiler', 'Layer', 
        'Meat Rabbits', 'Breeder Rabbits',
        'Tilapia', 'Catfish', 'Other Fish'
      ));
  END IF;
END $$;

-- Create index for species filtering
CREATE INDEX IF NOT EXISTS idx_flocks_species ON flocks(species);
CREATE INDEX IF NOT EXISTS idx_flocks_species_status ON flocks(species, status);

-- Add comment
COMMENT ON COLUMN flocks.species IS 'Animal species: poultry, rabbits, or aquaculture';
COMMENT ON COLUMN flocks.pond_size_sqm IS 'Pond size in square meters (aquaculture only)';
COMMENT ON COLUMN flocks.stocking_density IS 'Stocking density per square meter (aquaculture only)';











