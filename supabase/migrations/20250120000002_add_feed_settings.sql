-- Add feed unit and quantity per bag columns to farms table
-- These allow users to specify their feed measurement unit and bag size

ALTER TABLE farms
ADD COLUMN IF NOT EXISTS feed_unit TEXT DEFAULT 'bags',
ADD COLUMN IF NOT EXISTS feed_quantity_per_bag NUMERIC DEFAULT 50;

-- Add comments
COMMENT ON COLUMN farms.feed_unit IS 'Unit used to measure feed (bags, kg, g, tonnes). Default: bags';
COMMENT ON COLUMN farms.feed_quantity_per_bag IS 'Weight of one bag in kilograms. Default: 50kg';

-- Update existing farms to use default 50kg bags if not set
UPDATE farms
SET feed_unit = 'bags', feed_quantity_per_bag = 50
WHERE feed_unit IS NULL OR feed_quantity_per_bag IS NULL;
