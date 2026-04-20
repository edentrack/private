/*
  # Extend Egg Tables with Size-Based Tracking

  1. Changes to egg_collections
    - Add columns for tracking eggs by size (small, medium, large, jumbo)
    - Add damaged_eggs column
    - Add total_eggs column
    - Add collected_by reference
    - Keep existing columns for backward compatibility

  2. Changes to egg_sales
    - Add columns for selling eggs by size with individual prices
    - Add customer contact fields
    - Add payment tracking fields
    - Add sold_by reference
    - Keep existing columns for backward compatibility

  3. New Table: egg_inventory
    - Track current stock levels by size
    - One record per farm
    - Updates with collections and sales

  4. Security
    - Enable RLS on egg_inventory
    - Add policies for farm members
*/

-- Extend egg_collections with size tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'small_eggs') THEN
    ALTER TABLE egg_collections ADD COLUMN small_eggs int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'medium_eggs') THEN
    ALTER TABLE egg_collections ADD COLUMN medium_eggs int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'large_eggs') THEN
    ALTER TABLE egg_collections ADD COLUMN large_eggs int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'jumbo_eggs') THEN
    ALTER TABLE egg_collections ADD COLUMN jumbo_eggs int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'damaged_eggs') THEN
    ALTER TABLE egg_collections ADD COLUMN damaged_eggs int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'total_eggs') THEN
    ALTER TABLE egg_collections ADD COLUMN total_eggs int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'collected_by') THEN
    ALTER TABLE egg_collections ADD COLUMN collected_by uuid REFERENCES profiles(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_collections' AND column_name = 'collection_date') THEN
    ALTER TABLE egg_collections ADD COLUMN collection_date date DEFAULT CURRENT_DATE NOT NULL;
  END IF;
END $$;

-- Extend egg_sales with size tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'customer_name') THEN
    ALTER TABLE egg_sales ADD COLUMN customer_name varchar(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'customer_phone') THEN
    ALTER TABLE egg_sales ADD COLUMN customer_phone varchar(20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'small_eggs_sold') THEN
    ALTER TABLE egg_sales ADD COLUMN small_eggs_sold int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'medium_eggs_sold') THEN
    ALTER TABLE egg_sales ADD COLUMN medium_eggs_sold int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'large_eggs_sold') THEN
    ALTER TABLE egg_sales ADD COLUMN large_eggs_sold int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'jumbo_eggs_sold') THEN
    ALTER TABLE egg_sales ADD COLUMN jumbo_eggs_sold int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'small_price') THEN
    ALTER TABLE egg_sales ADD COLUMN small_price decimal(10,2) DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'medium_price') THEN
    ALTER TABLE egg_sales ADD COLUMN medium_price decimal(10,2) DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'large_price') THEN
    ALTER TABLE egg_sales ADD COLUMN large_price decimal(10,2) DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'jumbo_price') THEN
    ALTER TABLE egg_sales ADD COLUMN jumbo_price decimal(10,2) DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'total_eggs') THEN
    ALTER TABLE egg_sales ADD COLUMN total_eggs int DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'payment_status') THEN
    ALTER TABLE egg_sales ADD COLUMN payment_status varchar(20) DEFAULT 'paid' NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'payment_method') THEN
    ALTER TABLE egg_sales ADD COLUMN payment_method varchar(50);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'sold_by') THEN
    ALTER TABLE egg_sales ADD COLUMN sold_by uuid REFERENCES profiles(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'egg_sales' AND column_name = 'sale_date') THEN
    ALTER TABLE egg_sales ADD COLUMN sale_date date DEFAULT CURRENT_DATE NOT NULL;
  END IF;
END $$;

-- Create egg_inventory table
CREATE TABLE IF NOT EXISTS egg_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  small_eggs int DEFAULT 0 NOT NULL,
  medium_eggs int DEFAULT 0 NOT NULL,
  large_eggs int DEFAULT 0 NOT NULL,
  jumbo_eggs int DEFAULT 0 NOT NULL,
  last_updated timestamptz DEFAULT now() NOT NULL,
  UNIQUE(farm_id)
);

-- Indexes for egg_inventory
CREATE INDEX IF NOT EXISTS idx_egg_inventory_farm ON egg_inventory(farm_id);

-- Enable RLS on egg_inventory
ALTER TABLE egg_inventory ENABLE ROW LEVEL SECURITY;

-- RLS Policies for egg_inventory
CREATE POLICY "Farm members can view egg inventory"
  ON egg_inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = egg_inventory.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm members can insert egg inventory"
  ON egg_inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = egg_inventory.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm members can update egg inventory"
  ON egg_inventory FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = egg_inventory.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = egg_inventory.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm members can delete egg inventory"
  ON egg_inventory FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = egg_inventory.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );