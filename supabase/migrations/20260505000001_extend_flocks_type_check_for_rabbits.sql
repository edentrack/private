-- Extend flocks_type_check to allow rabbit types.
--
-- Bug discovered during 2026-05-05 stress audit: creating a rabbit flock
-- (Greenfield Rabbitry → "+ Create My First Rabbitry") returned 400 with
-- code 23514 because the existing CHECK constraint only allowed
-- {Layer, Broiler, Catfish, Tilapia, Clarias, Other Fish}.
--
-- The frontend correctly sends "Meat Rabbits" / "Breeder Rabbits" as the
-- type label (matching speciesModules.ts AnimalType union), so we extend
-- the constraint to match. This is purely additive — no existing rows
-- are affected.

ALTER TABLE flocks DROP CONSTRAINT IF EXISTS flocks_type_check;
ALTER TABLE flocks ADD CONSTRAINT flocks_type_check
  CHECK (type IN (
    'Layer',
    'Broiler',
    'Catfish',
    'Tilapia',
    'Clarias',
    'Other Fish',
    'Meat Rabbits',
    'Breeder Rabbits'
  ));
