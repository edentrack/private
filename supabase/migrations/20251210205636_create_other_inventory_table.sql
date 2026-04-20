/*
  # Create Other Inventory Table

  1. New Tables
    - `other_inventory`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, foreign key to farms)
      - `item_name` (text, name of inventory item)
      - `category` (text, category like Medication, Equipment, etc.)
      - `quantity` (numeric, current quantity in stock)
      - `unit` (text, unit of measurement)
      - `notes` (text, optional notes)
      - `last_updated` (timestamptz)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on `other_inventory` table
    - Add policy for authenticated users to read their farm's inventory
    - Add policy for authenticated users to insert inventory for their farm
    - Add policy for authenticated users to update their farm's inventory
    - Add policy for authenticated users to delete their farm's inventory
*/

-- Create other_inventory table
CREATE TABLE IF NOT EXISTS other_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  category text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'units',
  notes text,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE other_inventory ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their farm's other inventory"
  ON other_inventory FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert other inventory for their farm"
  ON other_inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their farm's other inventory"
  ON other_inventory FOR UPDATE
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

CREATE POLICY "Users can delete their farm's other inventory"
  ON other_inventory FOR DELETE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_other_inventory_farm_id ON other_inventory(farm_id);
CREATE INDEX IF NOT EXISTS idx_other_inventory_category ON other_inventory(category);
