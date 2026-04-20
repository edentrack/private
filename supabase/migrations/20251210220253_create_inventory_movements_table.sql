/*
  # Create Inventory Movements Table for Audit Trail

  1. New Tables
    - `inventory_movements`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, foreign key to farms)
      - `inventory_type` (enum: feed, other, eggs)
      - `inventory_item_id` (uuid, reference to feed_stock/other_inventory)
      - `direction` (enum: in, out)
      - `quantity` (numeric, amount moved)
      - `unit` (text, unit of measurement)
      - `source_type` (enum: expense, task, egg_collection, egg_sale, manual)
      - `source_id` (uuid, optional link to source record)
      - `created_by` (uuid, user who created the movement)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on `inventory_movements` table
    - Add policy for authenticated users to read their farm's movements
    - Add policy for authenticated users to insert movements for their farm
    - Add policy for authenticated users to update their farm's movements
    - Add policy for authenticated users to delete their farm's movements

  3. Purpose
    - Provides complete audit trail of all inventory changes
    - Tracks increases (purchases, collections) and decreases (usage, sales)
    - Links movements to their source (expense, task, etc.)
    - Enables reconciliation and historical reporting
*/

-- Create enum types
DO $$ BEGIN
  CREATE TYPE inventory_type_enum AS ENUM ('feed', 'other', 'eggs');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE movement_direction AS ENUM ('in', 'out');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE movement_source_type AS ENUM ('expense', 'task', 'egg_collection', 'egg_sale', 'manual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create inventory_movements table
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  inventory_type inventory_type_enum NOT NULL,
  inventory_item_id uuid NOT NULL,
  direction movement_direction NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  source_type movement_source_type NOT NULL,
  source_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their farm's inventory movements"
  ON inventory_movements FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert inventory movements for their farm"
  ON inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their farm's inventory movements"
  ON inventory_movements FOR UPDATE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their farm's inventory movements"
  ON inventory_movements FOR DELETE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_movements_farm_id ON inventory_movements(farm_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_id ON inventory_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON inventory_movements(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at);

-- Add comments
COMMENT ON TABLE inventory_movements IS 'Audit trail for all inventory changes across feed, other items, and eggs';
COMMENT ON COLUMN inventory_movements.direction IS 'in = increase stock, out = decrease stock';
COMMENT ON COLUMN inventory_movements.source_type IS 'What caused this movement: expense purchase, task usage, egg collection, etc.';
COMMENT ON COLUMN inventory_movements.source_id IS 'Optional FK to the source record (expense.id, task.id, etc.)';
